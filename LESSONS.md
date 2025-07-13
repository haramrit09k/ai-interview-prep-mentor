# Architectural Lessons Learned

This document tracks the key architectural decisions and design patterns implemented in the AI Interview Prep Mentor application. Each entry provides context, explores trade-offs, and explains the rationale from a real-world, industry-level perspective.

---

## Lesson 1: Storing User Answer History

### Context

The user asked whether we should store the history of answers they provide. This would allow for features like personalized revision sessions and progress tracking.

### The "Why": Problem & Trade-offs

**The Angel's Advocate (Pro-Implementation):**
- **High User Value:** Unlocks powerful features like personalized revision, progress tracking, and identifying weak spots.
- **Engagement:** Motivates users by showing them tangible proof of their improvement over time.
- **Data-Driven Insights:** Provides valuable (anonymous) data to improve the quality of the questions themselves.

**The Devil's Advocate (Anti-Implementation):**
- **High Complexity:** Requires a new database table, new API endpoints, and significant frontend UI work (dashboards, charts, history views).
- **Performance & Scale:** The `answer_history` table could grow extremely large, potentially becoming a performance bottleneck if not designed and indexed correctly. This increases maintenance overhead and infrastructure cost.
- **Privacy Concerns:** Storing user-generated content (their answers) introduces privacy considerations that must be handled carefully.

### The "How": Our Implementation (The MVP Approach)

We decided on a phased, **Minimum Viable Product (MVP)** approach.

**Phase 1 (Current):**
- **No Backend Changes:** We will not create a new database table yet.
- **Leverage `localStorage`:** We are using the browser's local storage (`answerHistory` state in `App.tsx`) to store the history of the *current session*.
- **Benefit:** This allows us to immediately provide value with a "Session Summary" in the `RevisionSummaryModal` without incurring the cost and complexity of a full backend implementation. We get 80% of the user value for 20% of the effort.

**Phase 2 (Future, if validated):**
- If users love the session summary, we will proceed with building the full backend solution.

### Real-World Perspective: Database Design & Indexing

If we were to build the backend (Phase 2), we would need a new table in our PostgreSQL database, likely called `answer_history`.

A simplified schema might look like this:

```sql
CREATE TABLE answer_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    question_id UUID NOT NULL,
    skill_id UUID NOT NULL,
    outcome TEXT NOT NULL, -- e.g., 'correct', 'incorrect'
    answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**This is where your question about indexing becomes critical.**

Imagine this table has 100 million rows. If a user wants to see their history for "Java", a query like `SELECT * FROM answer_history WHERE user_id = 'some-user-id'` would be incredibly slow. The database would have to perform a **"full table scan,"** reading every single one of the 100 million rows to find the ones that match.

**An index is like the index in the back of a book.** Instead of reading the whole book to find a topic, you look it up in the index and go directly to the right page. In a database, an index is a special, sorted data structure that maps column values to the physical location of the rows.

For the query above, we would need an index on the `user_id` column:

```sql
CREATE INDEX idx_answer_history_user_id ON answer_history(user_id);
```

Now, when the query runs, the database uses the highly-efficient index to instantly find the block of data for that user, avoiding a full table scan. The query goes from taking minutes to milliseconds.

**Key Design Decisions for this table:**
- **Which columns to index?** We should index columns that are frequently used in `WHERE` clauses or `JOIN` operations. For this table, `user_id` and `skill_id` are prime candidates. We might even create a **composite index** on `(user_id, skill_id)` for queries that filter by both at the same time.
- **Data Type Selection:** Using `UUID` for IDs is good practice. `TIMESTAMPTZ` (timestamp with time zone) is crucial for applications with users in different parts of the world.

By thinking about indexing *during the design phase*, we are building a system that is scalable and performant from the start.

### Keywords
- `MVP (Minimum Viable Product)`
- `Database Schema Design`
- `Database Index`
- `Query Performance`
- `Full Table Scan`
- `Scalability`
