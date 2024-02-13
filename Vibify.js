require('dotenv').config();
const express = require('express');
const routes = require('./routes/routes');


const app = express();
app.use(express.json());
app.use('/', routes);

app.use((req, res, next) => {
    res.status(404).json({error: '404: Not found'});
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server is running on port ${port}`));