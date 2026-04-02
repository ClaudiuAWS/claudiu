# Auth Flow — How Login Works in Fan Squad

## The short version

We use **AWS Cognito** for authentication. Think of it as AWS's built-in user management system — it handles passwords, tokens, and sessions so we don't have to build any of that ourselves.

We use the **Amplify SDK** in the frontend to talk to Cognito. It's just a library that makes the API calls for us.

---

## What the user sees

```
Register → Check email for code → Enter code → Login → In the app
```

That's it. No OAuth, no third-party logins, just email + password.

---

## The files that matter

```
src/
├── config/amplify.js        → Connects the app to our Cognito instance
├── services/auth.js         → All auth functions (login, register, logout)
├── hooks/useAuth.jsx        → React hook — gives any component access to the current user
├── components/ProtectedRoute.jsx  → Wraps pages that require login
└── pages/
    ├── LoginPage.jsx        → Login form
    ├── RegisterPage.jsx     → Register form
    └── ConfirmPage.jsx      → Email verification code form
```

---

## How to get the current user in any component

```javascript
import { useAuth } from "../hooks/useAuth";

export default function MyComponent() {
        const { user, logout } = useAuth();

        return <p>Hello {user.displayName}</p>;
}
```

`user` contains:

- `user.userId` — their unique ID (this is what goes in DynamoDB)
- `user.email`
- `user.displayName`

---

## How to make authenticated API calls

Every call to our backend needs an Authorization header with the user's token.

```javascript
import { getAccessToken } from "../services/auth";

const token = await getAccessToken();

const response = await fetch(`${import.meta.env.VITE_API_URL}/rooms`, {
        method: "POST",
        headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
        },
        body: JSON.stringify({ matchId: "123" }),
});
```

The token expires after 1 hour but Amplify refreshes it automatically — you never need to think about it.

---

## Environment variables needed

Create a `.env.local` file in the `frontend/` folder (never commit this):

```
VITE_USER_POOL_ID=eu-central-1_XXXXXXXXX
VITE_USER_POOL_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
VITE_API_URL=https://your-api-gateway-url/prod
VITE_WS_URL=wss://your-websocket-url/prod
```

Ask for the actual values on Discord — don't put them in the repo.

---

## Adding a new protected page

1. Create your page in `src/pages/`
2. Add the route in `App.jsx` wrapped in `<ProtectedRoute>`

```javascript
<Route
        path="/my-new-page"
        element={
                <ProtectedRoute>
                        <MyNewPage />
                </ProtectedRoute>
        }
/>
```

Done — unauthenticated users get redirected to login automatically.
