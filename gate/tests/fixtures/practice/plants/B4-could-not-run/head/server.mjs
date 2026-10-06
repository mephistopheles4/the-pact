import express from 'express';

const app = express();
app.get('/health', (_req, res) => res.status(200).send('ok'));
app.listen(Number(process.env.PORT ?? 8080));
