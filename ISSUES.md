# Issues to Address

## Refactor: Normalize unanswered questions schema

**Description:**
Currently, unanswered questions are stored as a JSON array within the 'users' table. This issue tracks the refactoring to a more normalized database schema for better querying, data integrity, and scalability. This would likely involve creating separate 'questions' and 'user_unanswered_questions' tables.

**Labels:** enhancement, database

## Security: Refactor token storage from localStorage to HttpOnly cookies

**Description:**
Currently, the Google ID token (and potentially other authentication tokens) is stored directly in `localStorage` on the frontend. This is a significant security vulnerability, primarily due to Cross-Site Scripting (XSS) attacks.

If an attacker successfully injects malicious JavaScript into the application, they can easily access and steal tokens from `localStorage`. These stolen tokens can then be used to impersonate the user, leading to unauthorized access, potential abuse of API quotas (e.g., Gemini API calls via the backend), and increased costs.

**Proposed Solution:**
Refactor token storage to use `HttpOnly` cookies. `HttpOnly` cookies cannot be accessed by client-side JavaScript, which provides a strong defense against XSS token theft. This will involve:
1.  Modifying the backend authentication flow (`server/auth.js` and `server/index.js`) to set the Google ID token as an `HttpOnly` cookie upon successful login.
2.  Updating the frontend (`App.tsx` and any other relevant components/services) to remove reliance on `localStorage` for token retrieval and instead rely on the browser automatically sending the `HttpOnly` cookie with authenticated requests to the backend.

**Labels:** security, critical, authentication