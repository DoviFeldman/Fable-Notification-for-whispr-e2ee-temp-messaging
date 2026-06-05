# whispr

Temporary, end-to-end encrypted chat. No accounts. No logs. Links expire 48h after last message.

I think the main benifit of this website(and PWA app) is that its self hostable for free within just a few minutes, (you just need to make an upstash redis account and a vercel
account which can be done using github, then just put your redis URL and Token into vercel and then its deployed!) and that theres no accounts. no sign up, no accounts, no phone number, no email, and you can just start chatting knowing that no ones logging everyone who you speak to and when(theres no accounts, and no logging) and that its stored on your 
accounts vercel server. you could use a VPN for extra security so that vercel and AWS doesnt know your IP address to know that youre visiting this site. 


## Two ways to chat

**Chat link** — generates a private URL for a 2-person encrypted chat. Optional password protection. Share the link with one other person and messages are encrypted end-to-end with ECDH + AES-GCM.

**PIN chat** — type any 4–20 character PIN (letters and numbers, case-sensitive) and anyone else who enters the same PIN joins the same room. No limit on participants. The encryption key is derived directly from the PIN using PBKDF2, so anyone with the PIN can decrypt — no key exchange needed. Decide on a PIN beforehand, then create/join from the home page independently.

## How it works

- All encryption happens in the browser with the Web Crypto API — **the server never sees plaintext**
- Chat links use **ECDH + AES-GCM**: each participant generates an ephemeral keypair and a shared secret is derived
- PIN chats use **PBKDF2 → AES-GCM**: the PIN is stretched into a 256-bit key (100k iterations); everyone with the PIN gets the same key
- Room IDs for PIN chats are derived from the PIN via SHA-256, so the same PIN always maps to the same room
- Every room auto-expires from Redis 48h after the last message

---

## Deploy in ~5 minutes

### 1. Upstash Redis (free, takes 2 min)

1. Go to [upstash.com](https://upstash.com) → sign up free
2. Create a new Redis database (pick any region)
3. Copy **UPSTASH_REDIS_REST_URL** and **UPSTASH_REDIS_REST_TOKEN** from the dashboard

### 2. Push to GitHub

```bash
git init
git add .
git commit -m "init"
gh repo create whispr --public --push
# or push manually to github.com
```

### 3. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → import your GitHub repo
2. Add environment variables:
   - `UPSTASH_REDIS_REST_URL` = your Upstash URL
   - `UPSTASH_REDIS_REST_TOKEN` = your Upstash token
3. Click Deploy

That's it. Your app is live.

---

## Free tier limits

- **Vercel**: Hobby plan handles ~20-100 simultaneous visitors easily, 100GB bandwidth/mo
- **Upstash**: 10,000 requests/day free, ~200MB storage — comfortably handles 20-50 active chats

## Local dev

```bash
cp .env.example .env.local
# fill in your Upstash credentials
npm install
npm run dev
```
