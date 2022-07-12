import path from "path";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as rds from "aws-cdk-lib/aws-rds";
import * as logs from "aws-cdk-lib/aws-logs"
import {
  CorsHttpMethod,
  HttpApi,
} from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";


class LHServerStack extends cdk.Stack {
  constructor(app: cdk.App, id: string, props: cdk.StackProps) {
    super(app, id, props);

    const vpc = ec2.Vpc.fromLookup(this, `${id}/vpc`, {
      isDefault: true,
    });

    const databaseCredentials = new rds.DatabaseSecret(this, `${id}/database-secret`, {
      secretName: `${id}/database-credentials`,
      username: 'lh_user',
    });

    const database = new rds.DatabaseInstance(this, `${id}/database`, {
      credentials: rds.Credentials.fromSecret(databaseCredentials),
      databaseName: `${id}_db`,
      deletionProtection: true,
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_14_2 }),
      instanceIdentifier: `${id}/db-server`,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      preferredBackupWindow: "02:00-03:00",
      preferredMaintenanceWindow: "Sun:03:00-Sun:04:00",
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      storageEncrypted: true,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    const lambdaFn = new lambda.DockerImageFunction(this, `${id}/lambda`, {
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, ".")),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_NAT },
      environment: {
        SECRET_NAME: databaseCredentials.secretName,
      },
      allowAllOutbound: true,
      memorySize: 512,
      timeout: cdk.Duration.seconds(15),
      logRetention: logs.RetentionDays.ONE_MONTH,
    });


    const httpApi = new HttpApi(this, `${id}/api-gateway`, {
      corsPreflight: {
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
        ],
        allowMethods: [
          CorsHttpMethod.OPTIONS,
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.PUT,
          CorsHttpMethod.PATCH,
          CorsHttpMethod.DELETE,
        ],
        allowOrigins: ["*"]
      },
      defaultIntegration: new HttpLambdaIntegration(`${id}/api-gateway-lambda-integration`, lambdaFn),
    });


    database.connections.allowFrom(lambdaFn, ec2.Port.tcp(database.instanceEndpoint.port));
    databaseCredentials.grantRead(lambdaFn);

    new cdk.CfnOutput(this, "API Gateway URL", {
      value: httpApi.url as string,
    })
  }
}

const app = new cdk.App();
new LHServerStack(app, 'geo-cloud-lighthouse-server', {
  env: { account: process.env.AWS_ACCOUNT_ID, region: 'us-east-1' }
});
app.synth();