# Streaming and Resumable Indexing Implementation

## Overview

The MCP Apple Notes server has been updated to support streaming responses and resumable indexing, allowing long-running index operations to be interrupted and resumed without losing progress.

## Key Features

### 1. **Resumable Indexing**
- Index state is persisted to `~/.mcp-apple-notes/index-state.json`
- Tracks which notes have been successfully processed
- If indexing is interrupted, running `index-notes` again will skip already-processed notes
- Failed notes are tracked separately and will be retried on subsequent runs

### 2. **Progress Streaming**
- Real-time progress updates are sent to the user during indexing
- Progress is logged to stderr for visibility even if the process gets interrupted
- Updates include:
  - Current batch number
  - Notes processed in current run
  - Total chunks created
  - Estimated completion progress

### 3. **Batch Processing**
- Notes are processed in batches of 5 to enable:
  - Better error isolation
  - Progress reporting between batches
  - Reduced memory footprint
  - Faster state persistence

### 4. **Error Handling**
- Individual note failures don't halt the entire indexing process
- Failed notes are tracked with error messages
- Users can retry failed notes by running `index-notes` again

## New Tool: `index-status`

A new tool has been added to check the current state of indexing:

```json
{
  "name": "index-status",
  "description": "Get the current status of the indexing process",
  "inputSchema": {
    "type": "object",
    "properties": {},
    "required": []
  }
}
```

**Response includes:**
- Number of processed notes
- Total notes in Apple Notes
- Number of indexed chunks
- Number of failed notes
- Last update timestamp
- List of failed notes with error messages

## Updated Tool: `index-notes`

### New Parameters
- `clearCache` (boolean, optional): Clear the index cache and restart from the beginning

### Response Format

The response now includes:
- All progress messages from the indexing process
- Final summary statistics:
  - Total notes
  - Notes processed in current run
  - Total chunks indexed
  - Time taken
  - Failed notes count (if any)

### Usage Examples

**Normal indexing (resumes from last checkpoint):**
```
Call tool: index-notes
```

**Fresh index (clear cache):**
```
Call tool: index-notes with clearCache=true
```

**Check status without indexing:**
```
Call tool: index-status
```

## State File Structure

Location: `~/.mcp-apple-notes/index-state.json`

```json
{
  "processedNotes": ["Note Title 1", "Note Title 2"],
  "failedNotes": [
    {
      "title": "Problem Note",
      "error": "Error message"
    }
  ],
  "lastUpdated": 1705779600000,
  "totalNotes": 150,
  "chunkCount": 250
}
```

## Implementation Details

### Index State Management

Three functions manage the index state:

1. **`loadIndexState()`**: Loads the current state from disk (or returns empty state if file doesn't exist)
2. **`saveIndexState(state)`**: Persists state to disk after each batch
3. **`clearIndexState()`**: Deletes the state file to start fresh

### Progress Callback

The `indexNotes` function now accepts an optional `onProgress` callback:

```typescript
onProgress?: (message: string) => void
```

This callback is used to report progress updates, which are:
- Collected in an array
- Logged to stderr in real-time
- Included in the final response to the user

### Batch Processing Loop

```typescript
const batchSize = 5;
for (let i = 0; i < notesToProcess.length; i += batchSize) {
  // Process batch
  // Add to database
  // Update and save state
  // Report progress
}
```

Each iteration:
1. Processes a batch of notes in parallel
2. Converts HTML content to Markdown using Turndown
3. Adds chunks to the database
4. Updates the in-memory state
5. Persists state to disk
6. Reports progress

## Performance Considerations

- **Batch Size**: Currently set to 5 notes per batch. Can be adjusted based on system memory.
- **State Persistence**: Happens after each batch, adding minimal overhead
- **Parallel Processing**: Notes within a batch are still processed in parallel using `Promise.all`

## Migration Notes

Existing users with no state file will:
1. Have a fresh `index-state.json` created automatically
2. Index all notes on first run
3. Benefit from resumable indexing on subsequent runs

To fully restart indexing from scratch, use:
```
index-notes with clearCache=true
```

## Testing the Implementation

1. **Start a normal index**: `index-notes`
2. **Interrupt the process** (Ctrl+C)
3. **Run again**: Should resume from the last batch, not restart
4. **Check status**: `index-status` shows progress
5. **Force restart**: `index-notes` with `clearCache=true`

## Future Enhancements

Possible improvements:
- Configurable batch size via tool parameters
- Retry strategy for failed notes (exponential backoff)
- Compression of state file for very large note collections
- Parallel batch processing (multiple batches simultaneously)
