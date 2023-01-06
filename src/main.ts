import PoppersCore, { IDHexString, PoppersAttachment } from "./poppers";
import express from "express";
import multer from 'multer';
import bodyParser from 'body-parser';
import cookieParser from "cookie-parser";
import fs from "fs";

const tmpdir = require('os').tmpdir() + "/poppers";
fs.mkdirSync(tmpdir, { recursive: true });

new PoppersCore("localhost", 27017, "poppers", poppers => {
    const app = express();
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(bodyParser.json());
    const upload = multer({ dest: tmpdir });
    app.settings["keepAliveTimeout"] = 5;
    app.use(cookieParser());

    app.get("/user/:id", (req, res) => {
        poppers.getUser(req.params.id, "id").then(user => {
            if (!user) { // user not found
                res.status(404).contentType("json").json({ message: `user @id-${req.params.id} does not exist` });
            }
            else {
                res.contentType("json").status(200).json({
                    id: user._id.toHexString(),
                    nickname: user.login,
                    avatar: user.avatar || null,
                });
            }
        });
    });
    // -----------------
    app.post("/login", upload.none(), (req, res) => {
        poppers.login(req.body.login, req.body.password).then(result => {
            if (typeof result === "number") {
                res.status(result).contentType("json").json({ message: "login failed" });
                console.log("login failed", result);
            }
            else {
                res.status(200).contentType("json").json({ message: "login success", poppers: result.sessid });
                console.log("login success", result);
            }
        });
    });
    // -----------------
    app.post("/register", upload.none(), (req, res) => {
        console.log(req.body);
        if (req.body.dryrun == "1") {
            if (
                req.body.email
                && (typeof req.body.email == "string")
                && PoppersCore.validateEmail(req.body.email as string)
            ) { // email check
                poppers.getUser(req.body.email as string, "email").then(user => {
                    if (user) {
                        res.status(409).contentType("json").json({ message: `${req.body.email} already exists` });
                    }
                    else {
                        res.status(200).contentType("json").json({ message: `${req.body.email} is available` });
                    }
                });
            }
            else if (req.body.login) {
                poppers.getUser(req.body.login as string, "login").then(user => {
                    if (user) {
                        res.status(409).contentType("json").json({ message: `${req.body.login} already exists` });
                    }
                    else {
                        res.status(200).contentType("json").json({ message: `${req.body.login} is available` });
                    }
                });
            } else {
                res.status(400).contentType("json").json({ message: `no login or email provided` });
            }
        }
        else {
            if (PoppersCore.validateEmail(req.body.email) &&
                PoppersCore.validatePassword(req.body.password) &&
                PoppersCore.validateLogin(req.body.login)) {

                poppers.addUser(req.body.login, req.body.email, req.body.password).then(result => {
                    let created = !!((result as IDHexString)?.value);
                    if (created) {
                        res.status(201).contentType("json").json({
                            message: "user created",
                            id: (result as IDHexString).value
                        });
                    }
                    else {
                        res.status(409).contentType("json").json({ message: "login or email already exists" });
                    }
                });
            }
            else {
                res.status(400).contentType("json").json({
                    message: "invalid credentials",
                    login: PoppersCore.validateLogin(req.body.login),
                    email: PoppersCore.validateEmail(req.body.email),
                    password: PoppersCore.validatePassword(req.body.password)
                });
            }
        }
    });
    // -----------------
    /**
     * This endpoint is used to get all recipients of the current user.
     * It requires a valid session id to be passed in the request body.
     */
    app.post("/messages", upload.none(), (req, res) => {
        let sessid = req.body.poppers;
        if (sessid) {
            poppers.validateSession(sessid).then(result => {
                if (result) {
                    poppers.getAllRecipients({ value: result }).then(recipients => {
                        res.status(200).contentType("json").json(recipients);
                    });
                }
                else {
                    res.status(403).contentType("json").json({ message: "invalid session" });
                }
            });
        }
        else {
            res.status(403).contentType("json").json({ message: "no session" });
        }
    });
    // -----------------
    app.post("/messages/:recipient/get", upload.none(), (req, res) => {
        let sessid = req.body.poppers;
        if (sessid) {
            poppers.validateSession(sessid).then(result => {
                console.log("session validation result", result);
                if (result) {
                    if (!isNaN(req.body.offset as number) && !isNaN(req.body.limit as number)) {
                        poppers.getMessagesBlock(
                            { value: result }, { value: req.params.recipient },
                            Number(req.body.offset), Number(req.body.limit)
                        ).then(messages => {
                            res.status(200).contentType("json").json(messages);
                        });
                    }
                    else {
                        res.status(400).contentType("json").json({ message: "proper offset and limit must be provided" });
                    }
                }
                else {
                    res.status(403).contentType("json").json({ message: "invalid session" });
                }
            });
        }
        else {
            res.status(403).contentType("json").json({ message: "no session" });
        }
    });
    // -----------------
    /**
     * This endpoint is used for app-side synchronization of messages.
     * It returns all messages that were sent after the timestamp provided or 0.
     */
    app.post("/sync/:recipient", upload.none(), (req, res) => {
        let sessid = req.body.poppers;
        if (sessid) {
            poppers.validateSession(sessid).then(result => {
                console.log("session validation result", result);
                if (result) {
                    poppers.syncMessages(
                        { value: result }, { value: req.params.recipient },
                        Number(req.body.timestamp)
                    ).then(messages => {
                        messages = messages?.map(message => {
                            return {
                                ...message,
                                sentByMe: (() => {
                                    return message.sender == result;
                                })()
                            }
                        });
                        res.status(200).contentType("json").json(messages || []);
                    });
                }
                else {
                    res.status(403).contentType("json").json({ message: "invalid session" });
                }
            });
        }
    });
    // -----------------
    app.post("/messages/:recipient/send", upload.array("attachments", 10), (req, res) => {
        console.log(req.files)
        let sessid = req.body.poppers;
        if (sessid) {
            poppers.validateSession(sessid).then(result => {
                if (result) {
                    if (req.params.recipient == result) {
                        res.status(400).contentType("json").json({ message: "you can't send messages to yourself" });
                        return;
                    }
                    let attachments: PoppersAttachment[] = ((req.files as Express.Multer.File[])?.map((file: Express.Multer.File) => {
                        if (file.fieldname == "attachments") {
                            return {
                                filename: file.originalname,
                                mimetype: file.mimetype,
                                data: (() => {
                                    let data = fs.readFileSync(file.path);
                                    fs.rmSync(file.path);
                                    return data;
                                })(),
                                allowedIDs: [{ value: result }, { value: req.params.recipient }]
                            }
                        }
                        else {
                            fs.rmSync(file.path);
                            return null;
                        }
                    }) || []) as PoppersAttachment[];
                    attachments.filter(a => a);
                    poppers.submitMessage({ value: result }, { value: req.params.recipient }, req.body.message, attachments).then(result => {
                        if (result) {
                            res.status(201).contentType("json").json({ message: "message sent" });
                        }
                        else {
                            res.status(400).contentType("json").json({ message: "invalid recipient" });
                        }
                    });
                }
                else {
                    res.status(403).contentType("json").json({ message: "invalid session" });
                }
            });
        }
        else {
            res.status(403).contentType("json").json({ message: "no session" });
        }
    });
    // -----------------
    /**
     * This endpoint is used for downloading attachments.
     * It returns the attachment if the user is allowed to access it.
     */
    app.post("/uploads/:id", upload.none(), (req, res) => {
        let sessid = req.body.poppers;
        if (sessid) {
            poppers.validateSession(sessid).then(result => {
                if (result) {
                    poppers.getAttachment({ value: req.params.id }).then(attachment => {
                        if (attachment) {
                            if (attachment.allowedIDs.some((id: IDHexString) => id.value == result)) {
                                res.status(200).contentType(attachment.mimetype).send(
                                    attachment.data.buffer
                                );
                            }
                            else {
                                res.status(403).contentType("json").json({ message: "access denied" });
                            }
                        }
                        else {
                            res.status(404).contentType("json").json({ message: "no such attachment" });
                        }
                    });
                }
                else {
                    res.status(403).contentType("json").json({ message: "invalid session" });
                }
            });
        }
        else {
            res.status(403).contentType("json").json({ message: "no session" });
        }
    });
    // -----------------
    app.get("/teapot", (req, res) => {
        res.status(418).contentType("json").json({ message: "I'm a teapot" });
        res.end();
    });

    app.listen(65120, () => {
        console.log("popperschat server started on port 65120");
    });

});
