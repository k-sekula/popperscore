# Popperscore

Poppers is a web API for handling user registration, login, and file attachments. It uses an Express framework and a MongoDB database for storage. It is intended to be used with the PoppersChat mobile app, which is about to be released soon.

## Prerequisites

- Node.js and NPM
- a MongoDB database running at localhost:27017.

## Installation

1. Clone the repository:

```bash
git clone https://github.com/k-sekula/popperscore.git
```

2. Install the dependencies:

```bash
cd poppers
npm install
```

3. Start the server:

```bash
npm start
```

## Usage

The following endpoints are available:

### User routes

- `POST /register`: create a new user. Pass the following JSON in the request body:

#### Normal mode (creation)

```json
{
    "login": <string>,
    "email": <string>,
    "password": <string>
}
```

#### Dry run mode (validation)

```json
{
    "dryrun": 1,
    "login": <string>,
    "email": <string>,
    "password": <string>
}
```

- `POST /login`: login as a user. Pass the following JSON in the request body:

```json
{
    "login": <string>,
    "password": <string>
}
```

- `GET /user/:id`: get any user's primary information. Replace `:id` with the user's ID.

### Messaging routes

- `POST /messages`: get all recipients of a user. The POST request body contains a session ID:

```json
{
    "poppers": <string>
}
```

- `POST /messages/:recipient/get`: get messages sent to a user and recieved from a user. Replace `:recipient` with the recipient's ID. The POST request body contains a session ID, a limit and an offset:

```json
{
    "poppers": <string>,
    "limit": <number>,
    "offset": <number>
}
```

- `POST /messages/:recipient/send`: send a message to a user. Replace `:recipient` with the recipient's ID. The POST request body contains the session ID, message text, and attachment file(s) sent with multipart/form-data. The fields are: `poppers`, `message` and `attachments`. The `attachments` field is an array of files with a limit of 10.

- `POST /sync/:recipient`: get messages sent to a user and recieved from a user. Replace `:recipient` with the recipient's ID. The POST request body contains the session ID and timestamp:

```json
{
    "timestamp": <number>,
    "poppers": <string>
}
```

### Attachment routes

- `POST /uploads/:id`: download a file attachment. Replace `:id` with the desired attachment's ID. The POST request body contains the session ID.

## License

This project is licensed under the MIT License. See the [LICENSE](/LICENSE) file for details.
