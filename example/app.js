const express = require('express');
const session = require('express-session');
const hbs = require('hbs');
const { randomUUID } = require('crypto');
const NordigenClient = require('nordigen-node');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = 3000;

app.disable('view cache');
app.set('view engine', 'hbs');
hbs.registerHelper('json', (context) => {
  return JSON.stringify(context);
});

app.set('json spaces', 4);
app.use(
  session({
    secret: randomUUID(),
    resave: true,
    saveUninitialized: false,
    cookie: {
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

app.set('etag', false);
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const COUNTRY = 'LV';
const REDIRECT_URI = 'http://localhost:3000/results';

const client = new NordigenClient({
  secretId: process.env.SECRET_ID,
  secretKey: process.env.SECRET_KEY,
});

// If you have existing token
// client.setToken(process.env.TOKEN);

// create new access token
const data = await client.generateToken();

app.get('/', async (req, res) => {
  //Get list of institutions
  const institutions = await client.institution.getInstitutions({
    country: COUNTRY,
  });
  res.render('index', { data: JSON.stringify(institutions) });
});

app.get('/agreements/:id', async (req, res) => {
  const institutionId = req.params.id;

  if (!institutionId) {
    res.render('index');
  }

  const init = await client.initSession({
    redirectUrl: REDIRECT_URI,
    institutionId: institutionId,
    referenceId: randomUUID(),
  });

  req.session.requisition = init.id;
  req.session.save((err) => {
    if (err) {
      throw new Error(err.message);
    }

    return res.redirect(init.link);
  });
});

app.get('/results/', async (req, res) => {
  const requisitionId = req.session.requisition;
  if (!requisitionId) {
    throw new Error(
      'Requisition ID is not found. Please complete authorization with your bank'
    );
  }

  const requisitionData = await client.requisition.getRequisitionById(
    requisitionId
  );
  const accountId = requisitionData.accounts[0];

  const account = client.account(accountId);
  const accountData = [
    {
      metadata: await account.getMetadata(),
      balances: await account.getBalances(),
      details: await account.getDetails(),
      transactions: await account.getTransactions(),
    },
  ];

  res.json(accountData);
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
