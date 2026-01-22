import express from 'express';
import 'dotenv/config';
import { loginToWeb } from './loginToWeb'; // move your logic to this file

const app = express();
const PORT = process.env.PORT || 3333;
const ENV = process.env.WEB_ENV || 'development';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/login-to-web', async (req, res) => {
  try {
    const  myCookies = await loginToWeb();
    res.status(200).json(myCookies);
  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ error: 'Web login failed', details: String(err) });
  }
});

app.post('/access-token', async (req, res) => {
  try {
    const { email, password, companyId, url, webEnv } = req.body || {};
    const myCookies = await loginToWeb({ email, password, companyId, url, webEnv });
    res.status(200).json({ accessToken: myCookies.find((c) => c.name === 'access_token')?.value || '' });
  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ error: 'Web login failed', details: String(err) });
  }
});

console.log(`Running in directory: ${process.cwd()}`);
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
