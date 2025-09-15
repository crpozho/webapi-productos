require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sql = require('mssql');

const app = express();
app.use(cors());
app.use(express.json());

// ---------- Config SQL Server (Somee) ----------
const sqlConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 1433),
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERT === 'true'
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

let pool;
async function getPool() {
  if (pool) return pool;
  pool = await sql.connect(sqlConfig);
  return pool;
}

// ---------- Healthcheck ----------
app.get('/health', async (_req, res) => {
  try {
    const p = await getPool();
    const r = await p.request().query('SELECT GETDATE() AS now');
    res.json({ ok: true, db_time: r.recordset[0].now });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ==================================================
//                     PRODUCTOS
// ==================================================

// GET /api/productos  -> listar
app.get('/api/productos', async (_req, res) => {
  try {
    const p = await getPool();
    const r = await p.request().query(
      `SELECT TOP (100) IdProducto, Nombre, Descripcion, Costo, Stock, FechaCreacion
       FROM dbo.Productos
       ORDER BY IdProducto DESC`
    );
    res.json(r.recordset);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/productos -> crear
app.post('/api/productos', async (req, res) => {
  try {
    const { nombre, descripcion, costo, stock } = req.body;
    if (!nombre || costo == null) {
      return res.status(400).json({ error: 'nombre y costo son obligatorios' });
    }

    const p = await getPool();
    const r = await p.request()
      .input('Nombre', sql.NVarChar(100), nombre)
      .input('Descripcion', sql.NVarChar(255), descripcion ?? null)
      .input('Costo', sql.Decimal(10, 2), Number(costo))
      .input('Stock', sql.Int, Number.isInteger(stock) ? stock : 0)
      .query(`
        INSERT INTO dbo.Productos (Nombre, Descripcion, Costo, Stock)
        VALUES (@Nombre, @Descripcion, @Costo, @Stock);
        SELECT SCOPE_IDENTITY() AS IdProducto;
      `);

    res.status(201).json({ message: 'Producto creado', IdProducto: r.recordset[0].IdProducto });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==================================================
//                     CATEGORÍAS
// ==================================================

// GET /api/categorias -> listar
app.get('/api/categorias', async (_req, res) => {
  try {
    const p = await getPool();
    const r = await p.request().query(
      `SELECT IdCategoria, Codigo, Nombre, Descripcion, Estado, FechaCreacion
       FROM dbo.Categorias
       ORDER BY IdCategoria DESC`
    );
    res.json(r.recordset);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/categorias -> crear
app.post('/api/categorias', async (req, res) => {
  try {
    const { codigo, nombre, descripcion, estado } = req.body;
    if (!codigo || !nombre) {
      return res.status(400).json({ error: 'codigo y nombre son obligatorios' });
    }

    const p = await getPool();
    const r = await p.request()
      .input('Codigo', sql.NVarChar(20), codigo)
      .input('Nombre', sql.NVarChar(100), nombre)
      .input('Descripcion', sql.NVarChar(255), descripcion ?? null)
      .input('Estado', sql.Bit, estado != null ? estado : 1)
      .query(`
        INSERT INTO dbo.Categorias (Codigo, Nombre, Descripcion, Estado)
        VALUES (@Codigo, @Nombre, @Descripcion, @Estado);
        SELECT SCOPE_IDENTITY() AS IdCategoria;
      `);

    res.status(201).json({ message: 'Categoría creada', IdCategoria: r.recordset[0].IdCategoria });
  } catch (e) {
    // error 2627 = violación de UNIQUE (por ejemplo, Codigo repetido)
    if (e.number === 2627) {
      return res.status(400).json({ error: 'El código ya existe' });
    }
    res.status(500).json({ error: e.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ API escuchando en http://localhost:${port}`));
