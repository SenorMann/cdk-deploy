import { APIGatewayEvent, APIGatewayProxyCallback, Context } from "aws-lambda";
import AWS from "aws-sdk";
import serverless, { Handler } from "serverless-http";
// @ts-ignore
import { createApp } from "@lhci/server";

let handler: Handler;
const secrets = new AWS.SecretsManager({});
const secretName = process.env.SECRET_NAME || "";

export async function main(event: APIGatewayEvent, context: Context, callback: APIGatewayProxyCallback) {
  try {
    if (!handler) {
      const { host, port, dbname, username, password } = await getSecretValue(secretName) as any;
      const { app } = await createApp({
        storage: {
          storageMethod: 'sql',
          sqlDialect: 'postgres',
          sqlConnectionSsl: true,
          sqlConnectionUrl: `postgresql://${username}:${password}@${host}:${port}/${dbname}`,
          sequelizeOptions: {
            dialectOptions: {
              ssl: {
                require: true,
                rejectUnauthorized: false
              }
            },
          }
        }
      });
      handler = serverless(app, { binary: ['application/json', 'image/*', 'font/*'] });
      const response = await handler(event, context);
      return response;
    }
  } catch (err: any) {
    console.error(err);
    callback(err);
  }
}


function getSecretValue(secretId: string) {
  return new Promise((resolve, reject) => {
    secrets.getSecretValue({ SecretId: secretId }, (err, { SecretString = "" }) => {
      if (err) return reject(err);
      return resolve(JSON.parse(SecretString));
    });
  });
}
