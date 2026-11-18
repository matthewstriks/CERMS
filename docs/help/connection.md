---
id: connection
keywords: offline internet connection network unavailable failed timeout retry error reconnect support
---

# Connection problems and support tickets

## Steps

1. Read the exact message and identify the operation: sign-in, loading records, sale/refund/drop save, message send, receipt delivery, update or local AI.
2. Check internet for sign-in, business reads, checkout, ticket submission and email delivery. Reconnect/refresh the affected screen through its offered controls.
3. For an uncertain mutation, keep the original request and use its same-request Retry action. Do not clear a pending sale/refund/drop, collect money again or create a second record because a response was lost.
4. For a read-only screen, retry loading. Unavailable data is not zero and a failed search does not mean no matching member exists.
5. If it persists, submit support details with app version, operating system, action/time and exact message. Include whether the original transaction remains pending.

## Important distinctions

Permission-denied requires reviewing saved business/rights with the owner; repeated network retry does not grant rights. A saved sale with a printer failure needs print retry, not checkout retry. An update error need not stop ordinary use of the current installed version. Local AI can answer offline after setup while Ollama is running, but finished-chat emails wait for internet/CERMS runtime. Do not disable security rules, switch databases or share credentials to troubleshoot connectivity. The AI cannot inspect your live business data or verify a bank/email outcome.
