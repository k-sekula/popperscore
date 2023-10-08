import { Db } from "mongodb";
import { User, Message, Session, getValidatorSchema } from "./collections.js";

export async function init(db: Db) {
    // Create collections if they don't exist.
    if (!await db.listCollections({ name: "users" }).hasNext())
        await db.createCollection<User>("users", {
            validator: getValidatorSchema("user")
        });
    if (!await db.listCollections({ name: "messages" }).hasNext())
        await db.createCollection<Message>("messages", {
            validator: getValidatorSchema("message")
        });
    if (!await db.listCollections({ name: "sessions" }).hasNext())
        await db.createCollection<Session>("sessions", {
            validator: getValidatorSchema("session")
        });
}
