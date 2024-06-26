import dotenv from 'dotenv';
import express from 'express';
import routes from './routes/routes.js';
import setupCors from './middlewares/setupCors.js';

dotenv.config();

const app = express();
app.use(setupCors);
app.use(express.json());
app.use('/', routes);

app.use((req, res, next) => {
    res.status(404).json({error: '404: Not found'});
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server is running on port ${port}`));