# Resuming VIRA on Your Laptop

Here is the exact step-by-step checklist to seamlessly resume working on your laptop without losing any progress or context.

---

## Step 1: Clone the Codebase on Your Laptop

Open PowerShell / Terminal on your laptop and run:

```powershell
git clone https://github.com/SoumyaSubhrajit/VIRA.git
cd VIRA/operator
npm install
```

---

## Step 2: Configure Fold MCP on Your Laptop

Because Antigravity's MCP configuration is local to each machine:

1. On your laptop, open or create:
   `C:\Users\<YourUsername>\.gemini\config\mcp_config.json`
2. Add the Fold MCP configuration:
   ```json
   {
     "mcpServers": {
       "fold-money": {
         "command": "npx",
         "args": ["-y", "mcp-remote", "https://mcp.fold.money/mcp"]
       }
     }
   }
   ```
3. Restart Antigravity on your laptop.
4. When prompted, complete the one-time Fold OTP authorization using your phone number.

---

## Step 3: Resuming This Conversation / Context in Antigravity

To pick up directly with the agent with full context:
1. Open the **VIRA** folder in Antigravity on your laptop.
2. In the chat, send this kick-off prompt:
   > *"I am continuing our VIRA project from my desktop. Git is synced, Fold MCP is configured. We verified the Fold live data (liquid balance ₹78.78, November spend ₹48k). We were planning to wire the Fold sync route into VIRA finance and work on the Gym goals. Let's continue."*

The agent will immediately inspect the codebase, verify the Fold MCP connection, and pick up right where we left off!
