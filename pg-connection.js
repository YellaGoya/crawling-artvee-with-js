import { Client } from "pg";

import dotenv from "dotenv";
dotenv.config({ path: __dirname + "/.env" });

const useSQL = (plain, values) => {
  const client = new Client({
    connectionString: process.env.POSTGRES_URL,
  });

  return new Promise(async (resolve, reject) => {
    try {
      await client.connect();
      const res = await client.query(plain, values);

      resolve(res.rowCount);
    } catch (error) {
      reject(error);
    } finally {
      await client.end();
    }
  });
};

export default useSQL;
