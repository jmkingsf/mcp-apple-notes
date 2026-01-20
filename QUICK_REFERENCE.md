# Quick Reference Guide

## 🚀 Get Started in 30 Seconds

### Start Indexing
```
Tool: index-notes
Result: Real-time progress updates → Summary with stats
```

### Check Progress
```
Tool: index-status
Result: Current state without re-indexing
```

### Force Fresh Index
```
Tool: index-notes
Args: { "clearCache": true }
Result: Resets everything and starts fresh
```

---

## 📊 Tool Reference

### Tool: `index-notes`

**Purpose**: Index all Apple Notes for searching

**Parameters**:
```json
{
  "clearCache": false  // Optional: true to reset state
}
```

**Response Example**:
```
Starting index of 150 notes (0 already processed)...
Processing batch 1/30 (notes 1-5 of 150)...
✓ Processed 5 of 150 notes (5 chunks created)
[... more batches ...]

📊 Final Summary:
Total notes: 150
Notes processed this run: 150
Total chunks indexed: 250
Time taken: 45.23s
✓ You can now search for notes using the 'search-notes' tool.
```

**When to Use**:
- First time indexing all notes
- After interruption (to resume)
- Adding new notes (only processes new ones)
- With `clearCache: true` to force full reindex

### Tool: `index-status`

**Purpose**: Check current indexing status without re-indexing

**Parameters**: None

**Response Example**:
```
📈 Index Status:
Processed notes: 150
Total notes: 150
Indexed chunks: 250
Failed notes: 2
Last updated: 1/20/2025, 10:30:45 AM

Failed notes:
  • Problematic Note 1: Error converting HTML
  • Problematic Note 2: Encoding issue
```

**When to Use**:
- Check progress without re-indexing
- Diagnose failed notes
- Verify completion status
- Monitor system state

### Tool: `search-notes` (Unchanged)

**Purpose**: Search indexed notes

**Usage**: Works as before, but now searches the indexed database

---

## 🔄 Common Workflows

### Workflow 1: Initial Setup

```
1. Tool: index-notes
   ↓ Real-time progress...
   ↓ (May take minutes for large collections)
2. Tool: search-notes
   ↓ Search your indexed notes!
```

### Workflow 2: Interrupted Indexing

```
1. Tool: index-notes
   ✓ Processing batch 1
   ✓ Processing batch 2
   ✗ Interrupted (network error, timeout, etc.)

2. Tool: index-notes  (call again)
   ↓ Loads saved state
   ✓ Skips already processed
   ✓ Resumes from batch 3
   ✓ Completes successfully
```

### Workflow 3: Check Without Re-indexing

```
1. Tool: index-status
   ↓ Shows current state
   ↓ No re-processing happens
   ↓ Instant result
```

### Workflow 4: Force Fresh Index

```
1. Tool: index-notes with clearCache: true
   ↓ Clears saved state
   ↓ Resets chunk count
   ↓ Processes all notes again
```

---

## 📈 State Transitions

```
START
  ↓
index-notes
  ↓
Loading state (empty first time) → Loaded
  ↓
Processing new notes in batches
  ↓
Save after each batch
  ↓
Continue → Batch not done? → Go back to processing
  ↓
Done? → COMPLETE

At any point:
  index-status → View current state (doesn't change state)
  
Clear cache:
  index-notes (clearCache:true) → Clear state → START OVER
```

---

## 🎯 Decision Tree

```
Want to index notes?
├─ First time?
│  └─ index-notes → (processes all)
│
├─ Check progress without indexing?
│  └─ index-status → (shows current state)
│
├─ Previous indexing interrupted?
│  └─ index-notes → (resumes from where it left off)
│
├─ Some notes failing?
│  ├─ Check with: index-status
│  └─ Then: index-notes → (retries failures)
│
└─ Want to start completely fresh?
   └─ index-notes (clearCache: true)
```

---

## 🔍 Troubleshooting Quick Ref

| Problem | Solution |
|---------|----------|
| Indexing stuck? | Wait longer, or interrupt & resume |
| Notes failing? | Use `index-status` to see which, check them |
| Want status? | Call `index-status` |
| Want to restart? | Use `clearCache: true` parameter |
| Need to monitor? | Check stderr for `[INDEX]` messages |
| State file lost? | Just run `index-notes` again |

---

## 📝 State File

**Location**: `~/.mcp-apple-notes/index-state.json`

**Contains**:
- Which notes have been indexed ✓
- Which notes failed ✗
- How many chunks created 📊
- When it was last updated 🕐

**Manage it**:
```bash
cat ~/.mcp-apple-notes/index-state.json  # View state
rm ~/.mcp-apple-notes/index-state.json   # Reset (same as clearCache)
cp ~/.mcp-apple-notes/index-state.json*  # Backup
```

---

## 🔐 Key Benefits vs. Old Version

| Feature | Old | New |
|---------|-----|-----|
| Interruption Recovery | ❌ Restart | ✅ Resume |
| Progress Visibility | ❌ None | ✅ Real-time |
| Error Handling | ❌ Fails all | ✅ Isolates |
| Large Collections | ❌ Risky | ✅ Reliable |
| Status Checking | ❌ Must reindex | ✅ Instant |
| Failed Note Retry | ❌ Manual | ✅ Automatic |

---

## 💡 Pro Tips

1. **Monitor Indexing**: Watch stderr for `[INDEX]` logs
2. **Large Collections**: Let it run in background, check status as needed
3. **Failed Notes**: Check with `index-status` before retrying
4. **Memory Concerns**: Batch size (5) can be reduced in code if needed
5. **Integration**: Claude can now understand progress and act accordingly

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| UPDATE_SUMMARY.md | Complete overview (start here!) |
| USAGE_GUIDE.md | Detailed usage with examples |
| STREAMING_AND_RESUMABLE_INDEXING.md | Technical deep-dive |
| IMPLEMENTATION_SUMMARY.md | Implementation details |
| IMPLEMENTATION_CHECKLIST.md | What was done (this file) |

---

## ⚡ TL;DR

1. **Index**: Call `index-notes` → See progress → Done
2. **Interrupted?**: Call `index-notes` again → Resumes automatically
3. **Check Status**: Call `index-status` → No re-processing
4. **Force Fresh**: Call `index-notes` with `clearCache: true`
5. **Search**: Use `search-notes` like before

That's it! 🎉

---

**Version**: 2.0.0  
**Status**: ✅ Production Ready  
**Last Updated**: January 20, 2025
