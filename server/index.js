import 'dotenv/config';
import app from './app.js';

const port = Number(process.env.PORT || 3850);
app.listen(port, () => {
  console.log(`Jaffer Brothers Group IT listening on http://localhost:${port}`);
});
