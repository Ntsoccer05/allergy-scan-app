Stop the local dev environment for allergy-scan-app.

1. Stop the PostgreSQL and Garage containers:
   ```
   docker compose stop db garage
   ```

2. Kill any running NestJS (port 3001) and Next.js (port 3000) dev processes:
   ```
   npx kill-port 3001 3000
   ```
   If kill-port is not available, use:
   ```
   netstat -ano | findstr ":3001 :3000"
   ```
   and kill the listed PIDs with `taskkill /PID <pid> /F`.

Report what was stopped.
