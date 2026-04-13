# QA & Security Check
1. Read all API route files and check for: missing auth guards, unvalidated inputs, exposed secrets
2. Check CORS configuration for origin consistency (localhost vs 127.0.0.1)
3. Verify environment variables are not hardcoded
4. Run `npx tsc --noEmit` for type errors
5. Report findings in a structured table
