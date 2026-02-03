# Test Approach 2: Pub/Sub DB Archiving with AWS DMS

This project demonstrates a database archiving strategy using AWS Database Migration Service (DMS). Use this project to simulate a primary database filling up with data and offloading old data to an archive database using an on-demand DMS task.

## What it does exactly

1. **Spin up Databases**: Starts two PostgreSQL databases (Primary & Archive) via Docker.
2. **Generate Data**: Provides an API to mass-generate sample "Task" and "TaskCandidate" data in the Primary DB.
3. **Archive Migration**:
    - Calculates a cutoff date (1 month ago).
    - Dynamically updates an AWS DMS Task with table mappings to select only data older than the cutoff.
    - Triggers the DMS task to move data from Primary to Archive.
    - Once confirmed, deletes the migrated data from the Primary DB.
4. **Streaming/Viewing**: Provides endpoints to "stream" (cursor-based pagination) data from both databases to verify the process.

## Prerequisites

- Node.js (v18+)
- Docker & Docker Compose
- AWS Account with a DMS Replication Instance and Task set up.

---

## AWS Configuration

### IAM User Permissions
The IAM user credential provided to the backend needs the following permissions to control the DMS task:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "dms:DescribeReplicationTasks",
                "dms:StartReplicationTask",
                "dms:ModifyReplicationTask",
                "dms:DescribeReplications",
                "dms:StartReplication",
                "dms:ModifyReplicationConfig"
            ],
            "Resource": "*"
        }
    ]
}
```
| if doesn't work
```json
{ 
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dms:ModifyReplicationTask",
        "dms:StartReplicationTask",
        "dms:DescribeReplicationTasks",
        "dms:StopReplicationTask"
      ],
      "Resource": "*"
    }
  ]
}
```
*Note: You can restrict `Resource` to the specific ARN of your DMS task for better security.*

### DMS Task Setup
You must manually create a DMS Source (Primary DB) and Target (Archive DB) Endpoint and a Replication Task (or Serverless Replication Config) in AWS.
- **Source Endpoint**: Connects to the Primary DB (expose via ngrok or make publicly accessible for DMS).
- **Target Endpoint**: Connects to the Archive DB.
- **Task/Config**: Create a task with `TargetTablePrepMode` set to `DO_NOTHING`. The app will overwrite the Table Mappings logic.

---

## Setup & Usage

### 1. Start Databases
```bash
docker-compose up -d
```
This starts:
- **Primary DB**: Port 5175
- **Archive DB**: Port 5176

### 2. Backend Setup (`be`)
Navigate to the backend directory:
```bash
cd be
npm install
```

Create a `.env` file based on `.env.example` (in `be` folder):
```ini
DMS_TASK_ARN=arn:aws:dms:us-east-1:123456789012:task:EXAMPLEREPLICATIONTASK
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# Primary Database (matches docker-compose)
PRIMARY_DB_HOST=localhost
PRIMARY_DB_USER=postgres
PRIMARY_DB_PASSWORD=postgres
PRIMARY_DB_NAME=primary
PRIMARY_DB_PORT=5175

# Archive Database (matches docker-compose)
ARCHIVE_DB_HOST=localhost
ARCHIVE_DB_USER=postgres
ARCHIVE_DB_PASSWORD=postgres
ARCHIVE_DB_NAME=archive
ARCHIVE_DB_PORT=5176
```

Run migration to setup tables:
```bash
npm run migrate:primary
npm run migrate:archive
```

Start the server:
```bash
npm run dev
```
Server runs on `http://localhost:3001`.

### 3. Frontend Setup (`fe`)
Navigate to the frontend directory:
```bash
cd ../fe
npm install
npm run dev
```
Client runs on `http://localhost:5173`.

---

## How to use

1. **Open the App**: Go to `http://localhost:5173`.
2. **Generate Data**: Click the "Add Sample Data" button. This creates recent and old tasks/candidates in the Primary DB.
3. **Verify Data**: Use the Primary DB Log viewer on the left to see data coming in.
4. **Run Archive**: Click "Run Archive Migration".
    - Watch the backend logs.
    - It will update the DMS task to select `created_at < 1 month ago`.
    - It starts the DMS task.
    - Waits for it to finish.
    - Deletes the moved data from Primary.
5. **Verify Archive**: Use the Archive DB Log viewer on the right to see the archived data appearing.
