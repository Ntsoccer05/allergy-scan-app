Start the local dev environment for allergy-scan-app.

Run the following steps in order:

1. Start the PostgreSQL container and wait until healthy:
   ```
   docker compose up db -d --wait
   ```

2. Start the NestJS backend in the background (port 3001):
   ```
   pnpm --filter backend start:dev
   ```

3. Start the Next.js frontend in the background (port 3000):
   ```
   pnpm --filter frontend dev
   ```

4. Wait 15 seconds, then verify both servers are responding:
   - backend: `curl -s http://localhost:3001/allergens`  → expect JSON array
   - frontend: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` → expect 200 or 307

Note: background processes will show exit code 1 when killed by /stop — this is expected and not an error.

Report the status of each step clearly. If a curl check fails, investigate and explain the error.
