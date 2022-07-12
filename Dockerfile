FROM amazon/aws-lambda-nodejs:16

WORKDIR ${LAMBDA_TASK_ROOT}

COPY package.json handler.js ./
RUN npm install --omit=dev

CMD ["handler.main"]