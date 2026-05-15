const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "parqueadero",
  password: "12345",
  port: 5432,
});

function validarPlaca(placa) {
  const regex = /^(?=(?:.*[A-Za-z]){3,})(?=(?:.*\d){3,})[A-Za-z0-9]{6}$/;
  return regex.test(placa);
}

// Obtener vehículos dentro
app.get("/vehiculos", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM vehiculos WHERE estado = 'dentro'"
  );
  res.json(result.rows);
});


// Registrar ingreso
app.post("/vehiculos", async (req, res) => {
  const { placa, tipo } = req.body;

  const placaLimpia = placa.trim().toUpperCase();

  if (!validarPlaca(placaLimpia)) {
    return res.status(400).json({
      error: "Placa inválida: debe tener 3 letras, 3 números y 6 caracteres"
    });
  }

  // evitar duplicados
  const existe = await pool.query(
    "SELECT * FROM vehiculos WHERE placa = $1 AND estado = 'dentro'",
    [placaLimpia]
  );

  if (existe.rows.length > 0) {
    return res.status(400).json({ error: "Vehículo ya está dentro" });
  }

  const result = await pool.query(
    "INSERT INTO vehiculos (placa, tipo) VALUES ($1, $2) RETURNING *",
    [placaLimpia, tipo]
  );

  res.json(result.rows[0]);
});


// Registrar salida
app.put("/vehiculos/:id", async (req, res) => {
  const { id } = req.params;

  // 1. Obtener vehículo
  const vehiculo = await pool.query(
    "SELECT * FROM vehiculos WHERE id = $1",
    [id]
  );

  if (vehiculo.rows.length === 0) {
    return res.status(404).json({ error: "No encontrado" });
  }

  const data = vehiculo.rows[0];

  const horaEntrada = new Date(data.hora_entrada);
  const horaSalida = new Date();

  // 2. Calcular tiempo
  const diferenciaMs = horaSalida - horaEntrada;

  const minutos = Math.ceil(diferenciaMs / (1000 * 60));

  // 3. Tarifa
  let base = 0;
  let valorMinuto = 0;

  // tarifas por tipo
  if (data.tipo === "carro") {
    base = 3000;
    valorMinuto = 100;
  } else if (data.tipo === "moto") {
    base = 2000;
    valorMinuto = 50;
  }

  const valor = base + (minutos * valorMinuto);

  const result = await pool.query(
    `UPDATE vehiculos 
     SET hora_salida = $1, estado = 'fuera', valor = $2
     WHERE id = $3 RETURNING *`,
    [horaSalida, valor, id]
  );

  res.json(result.rows[0]);
});

// Historial
app.get("/historial", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM vehiculos WHERE estado = 'fuera' ORDER BY hora_salida DESC"
  );
  res.json(result.rows);
});

app.listen(3000, () => {
  console.log("Servidor corriendo en http://localhost:3000");
});

//USUARIOS
const bcrypt = require("bcrypt");

app.post("/usuarios", async (req, res) => {
  const { username, password } = req.body;

  try {
    // validar duplicado
    const existe = await pool.query(
      "SELECT * FROM usuarios WHERE username = $1",
      [username]
    );

    if (existe.rows.length > 0) {
      return res.status(400).json({ error: "Usuario ya existe" });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "INSERT INTO usuarios (username, password, rol) VALUES ($1, $2, $3) RETURNING *",
      [username, hashedPassword, "ADMIN"]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error en registro" });
  }
});

app.get("/usuarios", async (req, res) => {
  const { username, password } = req.query;

  try {
    const result = await pool.query(
      "SELECT * FROM usuarios WHERE username = $1",
      [username]
    );

    const user = result.rows[0];

    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.json([]);
    }

    res.json([user]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error en login" });
  }
});