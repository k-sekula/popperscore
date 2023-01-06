import { Db, Document, MongoClient, ObjectId, WithId } from "mongodb";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";

export type IDHexString = { value: string };
export type InsertedIDHexString = IDHexString;
export type PoppersCredential = "id" | "login" | "email";
export type PoppersAttachment = {
    filename: string,
    mimetype: string,
    data: Buffer,
    allowedIDs: [IDHexString, IDHexString],
};

export default class PoppersCore {
    public connectionData: {
        host: string,
        port: number,
        database: string
    };
    private client: MongoClient | undefined;
    private dbo: Db | undefined;
    /**
     * 
     * @param host the host to connect to
     * @param port the port to connect to
     * @param database the database to connect to
     * @param onconnect the callback to call when the connection is established
     */
    constructor(host: string, port = 27017, database = "poppers", onconnect?: ((poppers: PoppersCore) => void)) {
        this.connectionData = { host, port, database };
        MongoClient.connect(`mongodb://${host}:${port}/${database}`).then(client => {
            console.log(client);
            console.log(client.db());
            this.client = client;
            this.dbo = client.db();
            this.dbo.collection("messages").createIndex({
                timestamp: -1
            }, { name: "messages_timestamp" });
            if (onconnect) onconnect(this);
        });
    }


    /**
     * 
     * @param login the login to register
     * @param email the email to register
     * @param password the password to register
     * @returns the inserted user's ID
     * @throws Error if the database instance is not initialized.
     */
    async addUser(login: string, email: string, password: string)
        : Promise<InsertedIDHexString | { err: true, loginExists: boolean, emailExists: boolean }> {

        let loginExists = !!await this.getUser(login, "login");
        let emailExists = !!await this.getUser(email, "email");

        if (!(loginExists || emailExists)) {
            if (this.dbo) {
                return {
                    value: (await this.dbo.collection("users").insertOne({
                        login, email, passwordHash: await this.encryptPassword(password)
                    })).insertedId.toHexString()
                };
            }
            else throw new Error("Database instance not initialized.");
        }
        else {
            return { err: true, loginExists, emailExists };
        }
    }

    /**
     * 
     * @param data the data to search for
     * @param by the credential to search by
     * @returns the user's data
     * @throws Error if the database instance is not initialized
     */
    async getUser(data: string | IDHexString, by: PoppersCredential) {
        if ((data as IDHexString).value) {
            try {
                new ObjectId((data as IDHexString).value);
            }
            catch (e) {
                return null;
            }
        }
        if (this.dbo) {
            let query;
            switch (by) {
                case "id":
                    try {
                        query = { _id: new ObjectId(typeof data == "string" ? data : data.value) };
                    }
                    catch (bsonTypeError) {
                        query = { _id: undefined };
                    }
                    break;
                case "login":
                    if (typeof data != "string")
                        throw new TypeError("login can be only a string");
                    query = { login: data };
                    break;
                case "email":
                    if (typeof data != "string")
                        throw new TypeError("email can be only a string");
                    query = { email: data };
                    break;
                default:
                    throw SyntaxError(`Unknown parameter "${by}".`);
            }
            return await this.dbo.collection("users").findOne(query);
        }
        else {
            throw new Error("Database instance not initialized.");
        }
    }
    /**
     * 
     * @param id the message's ID
     * @param by the field to search by
     * @param data the data to search for
     * @returns true if user is edited, false if not
     * @throws Error if database instance is not initialized
     */
    async editUser(id: IDHexString, by: "login" | "avatar", data: string) {
        if (this.dbo) {
            if (by == "login" || by == "avatar") {
                return !!(await this.dbo.collection("users").updateOne({
                    _id: new ObjectId(id.value)
                }, {
                    $set: {
                        [by]: data
                    }
                })).modifiedCount;
            }
        }
        else throw new Error("Database instance not initialized.");
    }
    /**
     * 
     * @param id the user's ID
     * @returns true if user is deleted, false if not
     * @throws Error if database instance is not initialized
     */
    async deleteUser(id: IDHexString): Promise<boolean> {
        if (this.dbo) {
            return !!(await this.dbo.collection("users").deleteOne({
                _id: new ObjectId(id.value)
            })).deletedCount; // returns true if deleted, false if not
        }
        else throw new Error("Database instance not initialized.");
    }
    /**
     * 
     * @param login the login to validate
     * @param password the password to validate
     * @returns the user's data or error code if login or password are incorrect
     * @throws Error if database instance is not initialized
     */
    async login(login: string, password: string) {
        let user = await this.getUser(login, "login");
        if (user) {
            if (await this.validatePassword(password, user.passwordHash)) { // if password is correct
                if (this.dbo) {
                    let sessid = await this.generateSessionID();
                    await this.dbo.collection("sessions").insertOne({
                        userID: user._id,
                        timestamp: Date.now(),
                        sessid
                    })
                    return {
                        user,
                        sessid
                    };
                }
                else throw new Error("Database instance not initialized.");
            }
            else return 403; // password is incorrect
        }
        else return 404; // login is incorrect
    }

    async generateSessionID() {
        let sessid = randomUUID();
        return sessid;
    }

    /**
     * 
     * @param plainPassword the plain password to encrypt
     * @returns encrypted password
     */
    async encryptPassword(plainPassword: string) {
        const salt = bcrypt.genSaltSync(10, "a");
        const hash = bcrypt.hashSync(plainPassword, salt);
        return hash;
    }
    /**
     * 
     * @param plainPassword the plain password to check
     * @param encryptedPassword the encrypted password to check against
     * @returns true if the passwords match, false if not
     */
    async validatePassword(plainPassword: string, encryptedPassword: string) {
        return bcrypt.compareSync(plainPassword, encryptedPassword);
    }

    /**
     * 
     * @param sender the sender's ID
     * @param recipient the recipient's ID
     * @param message the message to send
     * @param attachments the attachments to send
     * @returns the result of the operation
     * @throws Error if the database instance is not initialized
     */
    async submitMessage(sender: IDHexString, recipient: IDHexString, message: string, attachments: PoppersAttachment[]) {
        let report: { attachmentTooLarge?: true, tooManyAttachments?: true, messageSent: boolean } = { messageSent: false };
        // restrict the message length to 2000 characters
        if (message.length > 2000) {
            message = message.slice(0, 2000);
        }
        // restrict the attachments length to 10 and the attachment's data size to 8MiB
        if (attachments.length > 10) {
            attachments = attachments.slice(0, 10);
            report.tooManyAttachments = true;
        }
        for (let i = 0; i < attachments.length; i++) {
            if (attachments[i].data.length > 8 * 1024 * 1024) {
                delete attachments[i];
                report.attachmentTooLarge = true;
            }
        }
        attachments = attachments.filter(attachment => attachment);

        if (this.dbo) {
            let attachmentsIDs: {
                [key: number]: ObjectId;
            } = {};
            if (attachments.length)
                attachmentsIDs = (await this.dbo.collection("attachments").insertMany(attachments)).insertedIds;
            let attachmentsIDsArray: any[] = [];
            Object.keys(attachmentsIDs).forEach(key => {
                let key_num = Number(key); // convert key to number
                attachmentsIDsArray.push(attachmentsIDs[key_num]);
            });
            report.messageSent = !!(await this.dbo.collection("messages").insertOne({
                sender: new ObjectId(sender.value),
                recipient: new ObjectId(recipient.value),
                message,
                attachments: attachmentsIDsArray.length ? attachmentsIDsArray : null,
                timestamp: Date.now()
            })).insertedId; // true if inserted, false if not
            return report;
        }
        else throw new Error("Database instance not initialized.");
    }
    /**
     * 
     * @param sender the sender's ID
     * @param recipient the recipient's ID
     * @param offset the offset to start from
     * @param limit the limit of messages to return
     * @returns {} the messages
     */
    async getMessagesBlock(sender: IDHexString, recipient: IDHexString, offset: number, limit: number) {
        try {
            new ObjectId(sender.value);
            new ObjectId(recipient.value);
        }
        catch (e) {
            console.log(e);
            return [];
        }

        // restrict the limit to 100
        if (limit > 100) limit = 100;

        if (this.dbo) {
            return await this.dbo.collection("messages").find({
                $or: [
                    {
                        sender: new ObjectId(sender.value),
                        recipient: new ObjectId(recipient.value)
                    },
                    {
                        sender: new ObjectId(recipient.value),
                        recipient: new ObjectId(sender.value)
                    }
                ]
            }).sort(
                { timestamp: -1 }
            ).skip(offset).limit(limit).toArray();
        }
        else throw new Error("Database instance not initialized.");
    }
    /**
     * 
     * @param {IDHexString} sender 
     * @param {IDHexString} recipient 
     * @param {number} lastMessageTimestamp 
     * @returns {Promise<any[]>}
     */
    async syncMessages(sender: IDHexString, recipient: IDHexString, lastMessageTimestamp: number) {
        try {
            new ObjectId(sender.value);
            new ObjectId(recipient.value);
        }
        catch (e) {
            console.log(e);
            return [];
        }

        if (this.dbo) {
            return await this.dbo.collection("messages").find({
                $or: [
                    {
                        sender: new ObjectId(sender.value),
                        recipient: new ObjectId(recipient.value)
                    },
                    {
                        sender: new ObjectId(recipient.value),
                        recipient: new ObjectId(sender.value)
                    }
                ],
                timestamp: {
                    $gt: lastMessageTimestamp
                }
            }).sort(
                { timestamp: 1 }
            ).limit(10).toArray();
        }
    }
    async getAttachment(id: IDHexString) {
        if (this.dbo) {
            return await this.dbo.collection("attachments").findOne({
                _id: new ObjectId(id.value)
            });
        }
        else throw new Error("Database instance not initialized.");
    }
    async getAllRecipients(userID: IDHexString) {
        if (this.dbo) {
            let messages = await this.dbo.collection("messages").find({
                $or: [
                    {
                        sender: new ObjectId(userID.value)
                    },
                    {
                        recipient: new ObjectId(userID.value)
                    }
                ]
            }).toArray();
            let recipients: IDHexString[] = [];
            messages.forEach(message => {
                if (message.sender.toHexString() === userID.value) {
                    recipients.push(message.recipient.toHexString());
                }
                else {
                    recipients.push(message.sender.toHexString());
                }
            });

            // remove duplicates
            recipients = recipients.filter((value, index, self) => {
                return self.indexOf(value) === index;
            });

            return recipients;
        }
        else throw new Error("Database instance not initialized.");
    }
    /**
     * 
     * @param id the message's ID
     * @returns true if message is deleted, false if not
     */
    async deleteMessage(id: IDHexString) {
        if (this.dbo) {
            return !!(await this.dbo.collection("messages").deleteOne({
                _id: new ObjectId(id.value)
            })).deletedCount;
        }
        else throw new Error("Database instance not initialized.");
    }
    /**
     * 
     * @param sessid the session ID
     * @returns the user's data or null if the session ID is invalid
     */
    async validateSession(sessid: string): Promise<string | null> {
        if (this.dbo) {
            return (await this.dbo.collection("sessions").findOne({ sessid }))?.userID.toHexString() || null;
        }
        else throw new Error("Database instance not initialized.");
    }
    /**
     * 
     * @param email the email to validate
     * @returns 
     */
    static validateEmail(email: string) {
        return !!email?.match(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/);
    }
    /**
     * 
     * @param login the login to validate
     * @returns true if login meets the requirements, false if not
     */
    static validateLogin(login: string) {
        return !!login?.match(/^[a-zA-Z0-9._-]{3,16}$/);
        // 3-16 characters, only letters, numbers, underscores, dashes and dots
    }
    /**
     * 
     * @param password the password to validate
     * @returns true if password meets the requirements, false if not
     */
    static validatePassword(password: string) {
        // check if the password is a valid utf-8 string
        try {
            Buffer.from(password, "utf-8");
        }
        catch {
            return false;
        }
        return !!password?.match(/^.{8,32}$/); // 8-32 characters
    }
}
