# Spec: retry a flaky call once

withRetry(fn) calls fn. If fn throws, it calls fn one more time and returns
that result. On success it returns fn's value.
