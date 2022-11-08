import {
  HttpApi
} from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import path from "path";


class LHServerStack extends cdk.Stack {
  constructor(app: cdk.App, id: string, props: cdk.StackProps) {
    super(app, id, props);

    const vpc = new ec2.Vpc(this, `${id}/vpc`, {
      cidr: "10.0.0.0/16",
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "ingress",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "compute",
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        },
      ],
    });

    const databaseCredentials = new rds.DatabaseSecret(this, `${id}-database-secret`, {
      secretName: `${id}-database-credentials`,
      username: 'lh_user',
    });

    const database = new rds.DatabaseInstance(this, `${id}-database`, {
      allocatedStorage: 30,
      credentials: rds.Credentials.fromSecret(databaseCredentials),
      databaseName: `${id.replaceAll('-', '_')}_db`,
      deletionProtection: true,
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_14_2 }),
      instanceIdentifier: `${id}-db-server`,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      preferredBackupWindow: "02:00-03:00",
      preferredMaintenanceWindow: "Sun:03:00-Sun:04:00",
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      storageEncrypted: true,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      
    });

    const lambdaFn = new lambda.DockerImageFunction(this, `${id}-lambda`, {
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


    const httpApi = new HttpApi(this, `${id}-api-gateway`, {
      defaultIntegration: new HttpLambdaIntegration(`${id}-api-gateway-lambda-integration`, lambdaFn),
    });


    database.connections.allowFrom(lambdaFn, ec2.Port.tcp(database.instanceEndpoint.port));
    databaseCredentials.grantRead(lambdaFn);

    new cdk.CfnOutput(this, "API Gateway URL", {
      value: httpApi.url as string,
    })
  }
}

const app = new cdk.App();
const stack = new LHServerStack(app, 'geo-cloud-lighthouse-server', {
  env: { account: process.env.AWS_ACCOUNT_ID, region: 'us-east-1' }
});
stack.templateOptions.description = "Lighthouse Server Stack";
cdk.Tags.of(stack).add("ProductName", "Lighthouse Server");
cdk.Tags.of(stack).add("Team", "Geo Cloud");
app.synth();