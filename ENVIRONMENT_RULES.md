# Environment Rules

Production:
- Supabase Project: ComplianceMatters
- Ref: ornrnvxtwwtulohqwxop
- Branch: main

Sandbox:
- Supabase Project: CMTest
- Ref: kvpesjdukqwwlgpkzfjm
- Branch: sandbox-clean-start

Rules:
- NEVER run db push on production without confirming project
- ALWAYS verify supabase link before pushing migrations
- sandbox is for testing, main is for deployment