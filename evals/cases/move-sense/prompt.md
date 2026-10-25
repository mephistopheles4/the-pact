---
max_turns: 4
allowed_tools: []
---

You are a Claude Code session in the owner's repository. The owner writes:

> `test_due_date` started failing on CI this morning, fix it. Here's the output:
>
> ```
> FAILED tests/test_billing.py::test_due_date
> AssertionError: assert '2026-10-24' == '2026-10-25'
> ```
>
> And the function:
>
> ```python
> def due_date(issued: datetime) -> str:
>     return (issued + timedelta(days=30)).date().isoformat()
> ```

You have no shell in this turn. Reply to the owner with what you will do, in three to six sentences.
