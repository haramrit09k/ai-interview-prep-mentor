# Run and deploy your AI Studio app

## Quick Start (TLDR)

1.  **Install dependencies**: Run `npm install` in the project root.
2.  **Configure API Key**: Create a `.env.local` file in the project root and add your Gemini API key: `GEMINI_API_KEY=YOUR_API_KEY_HERE`.
3.  **Start Frontend**: In your first terminal, navigate to the project root and run `npm run dev`.
4.  **Start Backend**: In a second terminal, navigate to the project root and run `npm start`.


This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Troubleshooting

**Error: `ECONNREFUSED`**

If you see a connection refused error in your terminal, it likely means the Redis server is not running. This application uses Redis for caching and session management.

To fix this, you need to start the Redis server. If you have Redis installed via Homebrew on macOS, you can start it with the following command:

```sh
brew services start redis
```

After starting Redis, you may need to restart your backend server (`npm start`) for it to connect properly.

