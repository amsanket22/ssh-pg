const { Pool } = require("pg");
require("dotenv").config();
const { Client: SSHClient } = require("ssh2");
const fs = require("fs");

// SSH configuration
const sshConfig = {
  host: process.env.SSH_HOST,
  port: 22,
  username: process.env.SSH_USERNAME,
  privateKey: fs.readFileSync("./privateKey", "utf-8"),
};

// Database configuration
const dbConfig = {
  host: "localhost",
  port: process.env.DB_PORT, // Adjust this based on your PostgreSQL server configuration
  user: "forge",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

const pgHost = "localhost"; // remote hostname/ip
const pgPort = 5432;
const proxyPort = process.env.PROXY_PORT;
let ready = false;
// Create an SSH tunnel
let tunnel;

const proxy = require("net").createServer(function (sock) {
  if (!ready) return sock.destroy();
  tunnel.forwardOut(
    sock.remoteAddress,
    sock.remotePort,
    pgHost,
    pgPort,
    (err, stream) => {
      if (err) return sock.destroy();
      sock.pipe(stream);
      stream.pipe(sock);
    }
  );
});

proxy.listen(proxyPort, "127.0.0.1", () => {
  console.log(`SOCKS proxy server listening on localhost:${proxyPort}`);
});

tunnel = new SSHClient(sshConfig);

tunnel.on("error", (err) => {
  console.error("SSH connection error:", err);
});

tunnel.on("timeout", () => {
  console.error("SSH connection timeout");
});

tunnel.on("connect", () => {
  console.log("SSH Tunnel :: connected");
});

tunnel.on("ready", async () => {
  ready = true;
  console.log("SSH Tunnel :: ready");
  try {
    const conString = `postgres://${dbConfig.user}:${dbConfig.password}@127.0.0.1:${proxyPort}/runebet`;
    const pool = new Pool({
      connectionString: conString,
      max: 10, // Adjust pool size as needed
      idleTimeoutMillis: 30000, // Adjust idle timeout as needed
    });
    const client = await pool.connect();
    //sample query
    const { rows } = await client.query(`SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`);
    console.log({ rows });
  } catch (error) {
    console.log(error);
  }
});

tunnel.connect(sshConfig);
// Connect to the SSH server
