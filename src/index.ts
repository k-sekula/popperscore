import {
    Get,
    Post,
    listen,
    multerInstance,
} from "./core-util.js";
import {
    sessionExists,
    login,
    validateUserData,
    createUser,
    getUserByToken,
    deleteUser
} from "./users.js";
import {
    getMessages,
    sendMessage,
    getRecipients,
    deleteMessage,
    editMessage
} from "./messages.js";
import { Request, Response } from "express";
import { Db } from "mongodb";
import { config } from "dotenv";

import fs from "fs";

config();

type LoginData = Omit<Request, "body"> & {
    body: {
        username: string;
        password: string;
    };
}
type RegisterData = Omit<Request, "body"> & {
    body: {
        username: string;
        fullName?: string;
        password: string;
        email: string;
    }
};

class PoppersCore {
    static async authorize(req: Request & {db: Db, token?: string}, res: Response, next: Function) {
        const token = req.headers.authorization?.split(" ")[1]; // Bearer <token>
        if (token) {
            if (await sessionExists(token, req.db)) {
                req.token = token;
                next();
            } else {
                res.status(401).json({ error: "invalid_token" });
            }
        }
        else {
            res.status(401).json({ error: "no_token" });
        }
    }

    @Get("/", PoppersCore.authorize)
    getRecipientsEndpoint(req: Request & {db: Db, token: string}, res: Response) {
        getRecipients(req.token, req.db).then((result) => {
            res.json(result);
        });
    }

    @Post("/login")
    loginEndpoint(req: LoginData & {db: Db}, res: Response) {
        let username = req.body.username;
        let password = req.body.password;
        if (username && password) {
            login(username, password, req.db).then((result) => {
                if (result) {
                    res.json(result);
                } else {
                    res.status(401).json({ error: 'invalid_credentials' });
                }
            });
        } else {
            res.status(400).json({ error: 'missing_credentials' });
        }
    }

    @Post("/register")
    registerEndpoint(req: RegisterData & {db: Db}, res: Response) {
        let username = req.body.username;
        let password = req.body.password;
        let email = req.body.email;
        if (username && password && email) {
            let validationResult = validateUserData(req.body);
            if (validationResult.valid) {
                createUser({
                    username,
                    fullName: req.body.fullName,
                    password,
                    email,
                    db: req.db
                }).then((result) => {
                    if (result) {
                        res.json(result);
                    } else {
                        res.status(500).json({ error: 'internal_error' });
                    }
                });
            }
            else {
                res.status(400).json({ errors: validationResult.errors });
            }
        } else {
            res.status(400).json({ error: 'missing_credentials' });
        }
    }

    @Get("/search", PoppersCore.authorize)
    searchUserEndpoint(req: Request & {db: Db, token: string}, res: Response) {
        let query = req.query.q;
        if (query) {
            req.db.collection("users").find({
                $or: [
                    { username: { $regex: query, $options: "i" } },
                    { fullName: { $regex: query, $options: "i" } }
                ]
            }).toArray().then((result) => {
                res.json(result);
            });
        } else {
            res.status(400).json({ error: 'missing_query' });
        }
    }

    @Get("/messages/:recipientId/:page", PoppersCore.authorize)
    getMessagesEndpoint(req: Request & {db: Db, token: string}, res: Response) {
        getMessages(req.token, req.params.recipientId, req.db, Number(req.params.page)).then((result) => {
            res.json(result);
        });
    }

    @Post("/messages/:recipientId", PoppersCore.authorize, multerInstance.fields([
        {name: "attachments", maxCount: 10}
    ]))
    sendMessageEndpoint(req: Request & { db: Db, token: string }, res: Response) {
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };
        const message = req.body.message;
        const attachments = files.attachments.map((file) => {
            const data = fs.readFileSync(file.path);
            fs.rmSync(file.path);
            return {
                filename: file.originalname,
                data,
                createdAt: new Date()
            };
        });
        if (message) {
            sendMessage(req.token, req.params.recipientId, message, attachments, req.db).then((result) => {
                res.json(result);
            });
        } else {
            res.status(400).json({ error: 'missing_message' });
        }
    }

    @Post("/messages/:recipientId/delete", PoppersCore.authorize)
    deleteMessagesEndpoint(req: Request & { db: Db, token: string }, res: Response) {
        deleteMessage(req.token, req.params.recipientId, req.db).then((result) => {
            res.json(result);
        });
    }

    @Post("/messages/:recipientId/edit", PoppersCore.authorize)
    editMessagesEndpoint(req: Request & { db: Db, token: string }, res: Response) {
        const messageId = req.body.messageId;
        const message = req.body.newMessage;
        if (message) {
            editMessage(req.token, messageId, message, req.db).then((result) => {
                res.json(result);
            });
        }
        else {
            res.status(400).json({ error: 'missing_message' });
        }
    }

    @Get("/user", PoppersCore.authorize)
    getUserEndpoint(req: Request & {db: Db, token: string}, res: Response) {
        getUserByToken(req.token, req.db).then((result) => {
            res.json(result);
        });
    }

    @Post("/user/delete", PoppersCore.authorize)
    deleteUserEndpoint(req: Request & {db: Db, token: string}, res: Response) {
        deleteUser(req.token, req.db).then((result) => {
            res.json(result);
        });
    }

    init(port?: number) {
        const bindPort = port || Number(process.env.PORT) || 3000;
        listen(bindPort);
    }
}

const PoppersCoreInstance = new PoppersCore();
PoppersCoreInstance.init();
