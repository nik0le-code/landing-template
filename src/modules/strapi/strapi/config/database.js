const path = require("node:path");

// SQLite in a file: one process, no database server. DATABASE_FILENAME points it at a volume.
module.exports = ({ env }) => ({
  connection: {
    client: "sqlite",
    connection: { filename: path.resolve(__dirname, "..", env("DATABASE_FILENAME", ".tmp/data.db")) },
    useNullAsDefault: true,
  },
});
