C1. withRetry retries once: when fn throws on its first call only, withRetry returns the second call's value.
C2. On success, withRetry returns fn's value.
