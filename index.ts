import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import * as lancedb from "@lancedb/lancedb";
import { runJxa } from "run-jxa";
import path from "node:path";
import os from "node:os";
import TurndownService from "turndown";
import {
  EmbeddingFunction,
  LanceSchema,
  register,
} from "@lancedb/lancedb/embedding";
import { type Float, Float32, Utf8 } from "apache-arrow";
import { pipeline } from "@huggingface/transformers";
import * as fs from "node:fs/promises";

const { turndown } = new TurndownService();

// State management for resumable indexing
interface IndexState {
  processedNotes: string[];
  failedNotes: { title: string; error: string }[];
  lastUpdated: number;
  totalNotes: number;
  chunkCount: number;
}

const getStateFilePath = () =>
  path.join(os.homedir(), ".mcp-apple-notes", "index-state.json");

const loadIndexState = async (): Promise<IndexState> => {
  try {
    const stateFile = getStateFilePath();
    const data = await fs.readFile(stateFile, "utf-8");
    return JSON.parse(data);
  } catch {
    return {
      processedNotes: [],
      failedNotes: [],
      lastUpdated: 0,
      totalNotes: 0,
      chunkCount: 0,
    };
  }
};

const saveIndexState = async (state: IndexState) => {
  const stateDir = path.dirname(getStateFilePath());
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(getStateFilePath(), JSON.stringify(state, null, 2));
};

const clearIndexState = async () => {
  try {
    await fs.unlink(getStateFilePath());
  } catch {
    // File doesn't exist, that's fine
  }
};
const db = await lancedb.connect(
  path.join(os.homedir(), ".mcp-apple-notes", "data")
);
const extractor = await pipeline(
  "feature-extraction",
  "Xenova/all-MiniLM-L6-v2"
);

@register("openai")
export class OnDeviceEmbeddingFunction extends EmbeddingFunction<string> {
  toJSON(): object {
    return {};
  }
  ndims() {
    return 384;
  }
  embeddingDataType(): Float {
    return new Float32();
  }
  async computeQueryEmbeddings(data: string) {
    const output = await extractor(data, { pooling: "mean" });
    return output.data as number[];
  }
  async computeSourceEmbeddings(data: string[]) {
    return await Promise.all(
      data.map(async (item) => {
        const output = await extractor(item, { pooling: "mean" });

        return output.data as number[];
      })
    );
  }
}

const func = new OnDeviceEmbeddingFunction();

const notesTableSchema = LanceSchema({
  title: func.sourceField(new Utf8()),
  content: func.sourceField(new Utf8()),
  creation_date: func.sourceField(new Utf8()),
  modification_date: func.sourceField(new Utf8()),
  vector: func.vectorField(),
});

const QueryNotesSchema = z.object({
  query: z.string(),
});

const GetNoteSchema = z.object({
  title: z.string(),
});

const server = new Server(
  {
    name: "my-apple-notes-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list-notes",
        description: "Lists just the titles of all my Apple Notes",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "index-notes",
        description:
          "Index all my Apple Notes for Semantic Search. Streams progress updates. The sync takes couple of seconds up to couple of minutes depending on how many notes you have. Supports resumable indexing - run again if interrupted.",
        inputSchema: {
          type: "object",
          properties: {
            clearCache: {
              type: "boolean",
              description:
                "Clear the index cache and restart from beginning (optional)",
            },
          },
          required: [],
        },
      },
      {
        name: "get-note",
        description: "Get a note full content and details by title",
        inputSchema: {
          type: "object",
          properties: {
            title: z.string(),
          },
          required: ["title"],
        },
      },
      {
        name: "search-notes",
        description: "Search for notes by title or content",
        inputSchema: {
          type: "object",
          properties: {
            query: z.string(),
          },
          required: ["query"],
        },
      },
      {
        name: "create-note",
        description:
          "Create a new Apple Note with specified title and content. Must be in HTML format WITHOUT newlines",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            content: { type: "string" },
          },
          required: ["title", "content"],
        },
      },
      {
        name: "index-status",
        description: "Get the current status of the indexing process",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    ],
  };
});

const getNotes = async () => {
  const notes = await runJxa(`
    const app = Application('Notes');
app.includeStandardAdditions = true;
const notes = Array.from(app.notes());
const titles = notes.map(note => note.properties().name);
return titles;
  `);

  return notes as string[];
};

const getNoteDetailsByTitle = async (title: string) => {
  const note = await runJxa(
    `const app = Application('Notes');
    const title = "${title}"
    
    try {
        const note = app.notes.whose({name: title})[0];
        
        const noteInfo = {
            title: note.name(),
            content: note.body(),
            creation_date: note.creationDate().toLocaleString(),
            modification_date: note.modificationDate().toLocaleString()
        };
        
        return JSON.stringify(noteInfo);
    } catch (error) {
        return "{}";
    }`
  );

  return JSON.parse(note as string) as {
    title: string;
    content: string;
    creation_date: string;
    modification_date: string;
  };
};

export const indexNotes = async (
  notesTable: any,
  onProgress?: (message: string) => void
) => {
  const start = performance.now();
  let report = "";
  const state = await loadIndexState();
  const allNotes = (await getNotes()) || [];

  // Filter out already processed notes
  const notesToProcess = allNotes.filter(
    (note) => !state.processedNotes.includes(note)
  );

  if (notesToProcess.length === 0) {
    onProgress?.("✓ All notes already indexed. No new notes to process.");
    return {
      chunks: state.chunkCount,
      report: "All notes already indexed",
      allNotes: allNotes.length,
      processed: 0,
      time: performance.now() - start,
      resumed: true,
    };
  }

  onProgress?.(
    `Starting index of ${notesToProcess.length} notes (${state.processedNotes.length} already processed)...`
  );

  const processedChunks: any[] = [];
  const newFailedNotes: { title: string; error: string }[] = [];

  // Process notes in batches to enable streaming
  const batchSize = 5;
  for (let i = 0; i < notesToProcess.length; i += batchSize) {
    const batch = notesToProcess.slice(i, i + batchSize);
    const batchStartIndex = i;

    onProgress?.(
      `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(notesToProcess.length / batchSize)} (notes ${i + 1}-${Math.min(i + batchSize, notesToProcess.length)} of ${notesToProcess.length})...`
    );

    const batchDetails = await Promise.all(
      batch.map((note) => {
        try {
          return getNoteDetailsByTitle(note);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorMsg = `Error getting note details for ${note}: ${errorMessage}`;
          report += errorMsg + "\n";
          newFailedNotes.push({ title: note, error: errorMessage });
          return null;
        }
      })
    );

    const batchChunks = batchDetails
      .filter((n) => n !== null)
      .map((node) => {
        try {
          return {
            ...node,
            content: turndown(node.content || ""),
          };
        } catch (error) {
          return node;
        }
      })
      .map((note, index) => ({
        id: `${state.chunkCount + processedChunks.length + index}`,
        title: note.title,
        content: note.content,
        creation_date: note.creation_date,
        modification_date: note.modification_date,
      }));

    if (batchChunks.length > 0) {
      await notesTable.add(batchChunks);
      processedChunks.push(...batchChunks);
    }

    // Update state after each batch
    state.processedNotes.push(...batch.filter((note) => !newFailedNotes.some((f) => f.title === note)));
    state.chunkCount += batchChunks.length;
    state.failedNotes = [...state.failedNotes, ...newFailedNotes];
    state.lastUpdated = Date.now();
    state.totalNotes = allNotes.length;
    await saveIndexState(state);

    onProgress?.(
      `✓ Processed ${i + batchSize} of ${notesToProcess.length} notes (${processedChunks.length} chunks created)`
    );
  }

  onProgress?.(
    `\n✓ Indexing complete! Processed ${notesToProcess.length} notes, created ${processedChunks.length} chunks.`
  );

  if (state.failedNotes.length > 0) {
    onProgress?.(
      `\n⚠ ${state.failedNotes.length} notes failed to process. Run index again to retry them.`
    );
  }

  return {
    chunks: state.chunkCount,
    report,
    allNotes: allNotes.length,
    processed: notesToProcess.length,
    failed: newFailedNotes.length,
    time: performance.now() - start,
    resumed: notesToProcess.length < allNotes.length,
  };
};

export const createNotesTable = async (overrideName?: string) => {
  const start = performance.now();
  const notesTable = await db.createEmptyTable(
    overrideName || "notes",
    notesTableSchema,
    {
      mode: "create",
      existOk: true,
    }
  );

  const indices = await notesTable.listIndices();
  if (!indices.find((index) => index.name === "content_idx")) {
    await notesTable.createIndex("content", {
      config: lancedb.Index.fts(),
      replace: true,
    });
  }
  return { notesTable, time: performance.now() - start };
};

const createNote = async (title: string, content: string) => {
  // Escape special characters and convert newlines to \n
  const escapedTitle = title.replace(/[\\'"]/g, "\\$&");
  const escapedContent = content
    .replace(/[\\'"]/g, "\\$&")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");

  await runJxa(`
    const app = Application('Notes');
    const note = app.make({new: 'note', withProperties: {
      name: "${escapedTitle}",
      body: "${escapedContent}"
    }});
    
    return true
  `);

  return true;
};

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request, c) => {
  const { notesTable } = await createNotesTable();
  const { name, arguments: args } = request.params;

  try {
    if (name === "create-note") {
      const { title, content } = CreateNoteSchema.parse(args);
      await createNote(title, content);
      return createTextResponse(`Created note "${title}" successfully.`);
    } else if (name === "list-notes") {
      return createTextResponse(
        `There are ${await notesTable.countRows()} notes in your Apple Notes database.`
      );
    } else if (name == "get-note") {
      try {
        const { title } = GetNoteSchema.parse(args);
        const note = await getNoteDetailsByTitle(title);

        return createTextResponse(`${note}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return createTextResponse(errorMessage);
      }
    } else if (name === "index-notes") {
      const clearCache = (args as any)?.clearCache === true;
      if (clearCache) {
        await clearIndexState();
      }

      // Collect all progress updates
      const progressUpdates: string[] = [];
      const onProgress = (message: string) => {
        progressUpdates.push(message);
        // Also log to stderr for real-time visibility
        console.error(`[INDEX] ${message}`);
      };

      const result = await indexNotes(notesTable, onProgress);

      // Format final response with all progress
      const failedCount = result.failed || 0;
      const finalMessage = [
        ...progressUpdates,
        "",
        "📊 Final Summary:",
        `Total notes: ${result.allNotes}`,
        `Notes processed this run: ${result.processed}`,
        `Total chunks indexed: ${result.chunks}`,
        `Time taken: ${(result.time / 1000).toFixed(2)}s`,
        ...(failedCount > 0
          ? [
              `Failed notes: ${failedCount}`,
              "Run index-notes again to retry failed notes.",
            ]
          : []),
        "",
        "✓ You can now search for notes using the 'search-notes' tool.",
      ].join("\n");

      return createTextResponse(finalMessage);
    } else if (name === "index-status") {
      const state = await loadIndexState();
      const allNotes = await getNotes();

      const statusMessage = [
        "📈 Index Status:",
        `Processed notes: ${state.processedNotes.length}`,
        `Total notes: ${allNotes.length}`,
        `Indexed chunks: ${state.chunkCount}`,
        `Failed notes: ${state.failedNotes.length}`,
        `Last updated: ${state.lastUpdated ? new Date(state.lastUpdated).toLocaleString() : "Never"}`,
        "",
        ...(state.failedNotes.length > 0
          ? [
              "Failed notes:",
              ...state.failedNotes.map((f) => `  • ${f.title}: ${f.error}`),
            ]
          : []),
      ].join("\n");

      return createTextResponse(statusMessage);
    } else if (name === "search-notes") {
      const { query } = QueryNotesSchema.parse(args);
      const combinedResults = await searchAndCombineResults(notesTable, query);
      return createTextResponse(JSON.stringify(combinedResults));
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Invalid arguments: ${error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ")}`
      );
    }
    throw error;
  }
});

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Local Machine MCP Server running on stdio");

const createTextResponse = (text: string) => ({
  content: [{ type: "text", text }],
});

/**
 * Search for notes by title or content using both vector and FTS search.
 * The results are combined using RRF
 */
export const searchAndCombineResults = async (
  notesTable: lancedb.Table,
  query: string,
  limit = 20
) => {
  const [vectorResults, ftsSearchResults] = await Promise.all([
    (async () => {
      const results = await notesTable
        .search(query, "vector")
        .limit(limit)
        .toArray();
      return results;
    })(),
    (async () => {
      const results = await notesTable
        .search(query, "fts", "content")
        .limit(limit)
        .toArray();
      return results;
    })(),
  ]);

  const k = 60;
  const scores = new Map<string, number>();

  const processResults = (results: any[], startRank: number) => {
    results.forEach((result, idx) => {
      const key = `${result.title}::${result.content}`;
      const score = 1 / (k + startRank + idx);
      scores.set(key, (scores.get(key) || 0) + score);
    });
  };

  processResults(vectorResults, 0);
  processResults(ftsSearchResults, 0);

  const results = Array.from(scores.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([key]) => {
      const [title, content] = key.split("::");
      return { title, content };
    });

  return results;
};

const CreateNoteSchema = z.object({
  title: z.string(),
  content: z.string(),
});
