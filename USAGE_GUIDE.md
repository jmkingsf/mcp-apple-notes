# Using the Updated MCP Apple Notes Server

## Quick Start

### Initial Setup

```bash
cd mcp-apple-notes
bun install
bun start
```

## Using the New Features

### 1. Streaming Indexing with Progress

When you call `index-notes`, you'll now see real-time progress:

```
Starting index of 150 notes (0 already processed)...
Processing batch 1/30 (notes 1-5 of 150)...
✓ Processed 5 of 150 notes (5 chunks created)
Processing batch 2/30 (notes 6-10 of 150)...
✓ Processed 10 of 150 notes (10 chunks created)
...
✓ Indexing complete! Processed 150 notes, created 250 chunks.

📊 Final Summary:
Total notes: 150
Notes processed this run: 150
Total chunks indexed: 250
Time taken: 45.23s
✓ You can now search for notes using the 'search-notes' tool.
```

### 2. Resumable Indexing

If indexing is interrupted (network failure, timeout, etc.):

**First run (interrupted):**
```
Processing batch 3/30 (notes 11-15 of 150)...
✓ Processed 15 of 150 notes (15 chunks created)
[Connection lost]
```

**Second run (automatic resume):**
```
Starting index of 135 notes (15 already processed)...
Processing batch 4/30 (notes 16-20 of 135)...
✓ Processed 20 of 135 notes (20 chunks created)
[Continues from where it left off]
```

### 3. Check Indexing Status

Without re-running the entire index, you can check the current status:

**Tool: `index-status`**

Response:
```
📈 Index Status:
Processed notes: 150
Total notes: 150
Indexed chunks: 250
Failed notes: 2
Last updated: 1/20/2025, 10:30:45 AM

Failed notes:
  • Problematic Note 1: Error converting HTML to Markdown
  • Problematic Note 2: Encoding issue detected
```

### 4. Clear Cache and Start Fresh

If you want to completely restart the indexing:

**Tool: `index-notes` with parameter `clearCache: true`**

Response:
```
Starting index of 150 notes (0 already processed)...
Processing batch 1/30 (notes 1-5 of 150)...
[Starts from beginning, doesn't use saved state]
```

## Understanding the State File

The server maintains a file at `~/.mcp-apple-notes/index-state.json`:

```json
{
  "processedNotes": [
    "My Work Projects",
    "Travel Plans",
    "Recipe Ideas",
    ...
  ],
  "failedNotes": [
    {
      "title": "Corrupted Note",
      "error": "Cannot parse HTML content"
    }
  ],
  "lastUpdated": 1705774245000,
  "totalNotes": 150,
  "chunkCount": 250
}
```

**What it tracks:**
- `processedNotes`: Successfully indexed notes (won't be re-indexed)
- `failedNotes`: Notes that failed (will be retried on next index run)
- `lastUpdated`: When the state was last saved
- `totalNotes`: Total notes in Apple Notes
- `chunkCount`: Total chunks in the database

## Common Scenarios

### Scenario 1: Large Note Collection

**Problem:** You have 1,000+ notes and indexing might take a long time

**Solution:**
1. Run `index-notes` - it will process in batches
2. If you lose connection, just run `index-notes` again
3. Progress is saved after each batch of 5 notes
4. You only index new/unprocessed notes on retry

### Scenario 2: Some Notes Won't Index

**Problem:** You see errors for certain notes in `index-status`

**Solution:**
1. Check the error with `index-status` to see which notes failed
2. Manually review those notes in Apple Notes
3. Run `index-notes` again - it will retry the failed notes
4. If still failing, consider deleting/recreating the note

### Scenario 3: Want to Re-index Everything

**Problem:** You want to update the entire index (e.g., after changing settings)

**Solution:**
1. Run `index-notes` with `clearCache: true`
2. This clears the state file and starts fresh
3. Be aware this might take a long time for large collections

### Scenario 4: Check Progress Without Re-indexing

**Problem:** Wondering how many notes are indexed without starting a new index

**Solution:**
1. Call `index-status` tool
2. It shows:
   - How many notes are processed
   - How many chunks are in the database
   - Any failed notes
   - When it was last updated

## Performance Tips

1. **Adjust Batch Size**: If you have very limited memory, the batch size (currently 5) can be reduced by modifying the code
2. **Monitor Stderr**: Progress updates go to stderr, so they're visible even in slow connections
3. **Run During Quiet Times**: Large indexing operations can use significant CPU/memory
4. **Check Failed Notes**: Regularly use `index-status` to see if any notes are consistently failing

## Troubleshooting

### Issue: Indexing seems stuck

**Try:**
1. Wait a bit longer (large collections take time)
2. Check `index-status` to see if it's making progress
3. If truly stuck, interrupt and run `index-notes` again to resume

### Issue: Same notes failing repeatedly

**Try:**
1. Use `index-status` to identify the failing notes
2. Open them in Apple Notes and check for corruption
3. Consider deleting and recreating the note
4. Run `index-notes` again

### Issue: Want to debug what's happening

**Check:**
1. State file: `~/.mcp-apple-notes/index-state.json`
2. Server stderr output: Shows `[INDEX]` prefixed progress messages
3. Search should work even if some notes fail to index

## Advanced Usage

### Manual State Management

If needed, you can manually manage the state:

```bash
# View current state
cat ~/.mcp-apple-notes/index-state.json

# Clear state (equivalent to clearCache: true)
rm ~/.mcp-apple-notes/index-state.json

# Backup state before making changes
cp ~/.mcp-apple-notes/index-state.json ~/.mcp-apple-notes/index-state.json.bak
```

### Integration with Claude

In your Claude Desktop config, the updated server will:

1. Show progress updates in real-time
2. Allow Claude to understand indexing status
3. Let Claude decide to retry or clear cache based on results
4. Provide feedback about which notes are failing

**Example Claude interaction:**

Claude: "Let me index your notes"
Server: "Starting index of 150 notes..."
[Progress updates stream in]
Claude: "I see 3 notes are failing. Should we retry them?"
User: "Yes, retry them"
Claude: "Running index-notes again..."
Server: "Starting index of 3 notes (147 already processed)..."

## Migration from Old Version

If you're upgrading from the old version:

1. **First run**: `index-notes` will index all notes (as before)
2. **Subsequent runs**: Will only index new notes (resumable)
3. **To force full re-index**: Use `clearCache: true`

The old behavior didn't have resumability, but the new version is backward compatible and automatically starts fresh if no state file exists.
