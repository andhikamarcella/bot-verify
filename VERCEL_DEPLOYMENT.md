# Vercel Deployment Instructions

## Problem
Frontend di-deploy ke Vercel (`https://vfydsgn.vercel.app/`) tapi API calls masih ke `localhost:3001` karena `NEXT_PUBLIC_API_BASE` tidak di-set di production.

## Solution

### 1. Set Environment Variable di Vercel
1. Buka [Vercel Dashboard](https://vercel.com/dashboard)
2. Pilih project `vfydsgn`
3. Go to **Settings** → **Environment Variables**
4. Add variable:
   - **Name**: `NEXT_PUBLIC_API_BASE`
   - **Value**: `https://your-api-server.com` (ganti dengan API server URL yang sebenarnya)
5. Click **Save**
6. Redeploy project

### 2. API Server Requirements
API server harus:
- Di-deploy ke hosting yang accessible dari internet
- Support HTTPS (required untuk production)
- Support CORS untuk Vercel domain
- Run di port yang benar (biasanya 443 untuk HTTPS)

### 3. Deployment Options untuk API Server

#### Option A: Vercel Serverless Functions
- Deploy API sebagai serverless functions di Vercel
- Same domain, tidak perlu CORS

#### Option B: Railway/Render/Heroku
- Deploy Node.js app ke Railway/Render/Heroku
- Dapat HTTPS URL otomatis
- Example: `https://your-api.railway.app`

#### Option C: VPS/Dedicated Server
- Deploy ke VPS (DigitalOcean, Vultr, etc)
- Setup SSL certificate
- Example: `https://api.yourdomain.com`

### 4. Testing
Setelah environment variable di-set:

1. **Test API Test Page**:
   - Buka `https://vfydsgn.vercel.app/api-test`
   - Click "Test API Connection"
   - Should connect ke production API

2. **Test Interview Page**:
   - Buka interview link dari DM bot
   - Should load tanpa infinite loading

3. **Check Browser Console**:
   - `[Interview] API URL: https://your-api-server.com/api/interview-status?token=xxx`
   - `[Interview] Response status: 200`

### 5. Debugging

#### Jika masih error:
```javascript
// Di browser console
[Interview] API URL: https://your-api-server.com/api/interview-status?token=xxx
[Interview] Response status: 0 (CORS error)
[Interview] Fetch error: TypeError: Failed to fetch
```

**Solution**: Tambah CORS header di API server:
```javascript
// Di api/index.js
app.use(cors({
  origin: ['https://vfydsgn.vercel.app', 'http://localhost:3000'],
  credentials: true
}));
```

#### Jika API server tidak accessible:
```javascript
[Interview] Fetch error: TypeError: Network request failed
```

**Solution**: Pastikan API server online dan accessible dari internet.

### 6. Quick Fix (Sementara)
Untuk testing sementara, edit langsung di interview page:

```javascript
// Ganti line 76 di web/app/interview/page.tsx
return 'https://your-temp-api-url.com'; // Ganti dengan API URL yang work
```

## Next Steps
1. Deploy API server ke hosting yang accessible
2. Set `NEXT_PUBLIC_API_BASE` di Vercel
3. Test interview page
4. Verify CORS configuration

## Help
Jika butuh bantuan deploy API server:
- Railway: `railway login` → `railway up`
- Render: Connect GitHub repo
- VPS: Setup dengan PM2 dan Nginx
