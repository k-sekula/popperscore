import { Db, ObjectId } from 'mongodb';
import {
    Message,
    Attachment
} from './utils/collections.js';
import {
    getUserByToken
} from './users.js';

async function getRecipients(sessionToken: string, db: Db){
    const thisUser = await getUserByToken(sessionToken, db);
    if(!thisUser) throw new Error("Invalid session token");
    const recipients = await db.collection<Message>("messages").aggregate([
        { $match: { $or: [{ from: thisUser._id }, { to: thisUser._id }] } },
        { $group: { _id: { $cond: [{ $eq: ["$from", thisUser._id] }, "$to", "$from"] } } },
        { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
        { $unwind: "$user" },
        { $project: { _id: 1, username: "$user.username", fullName: "$user.fullName", avatar: { $ifNull: ["$user.avatar", null] }
     } }
    ]).toArray();
    return recipients;
}

async function getMessages(sessionToken: string, recipientId: string, db: Db, page: number){
    const thisUser = await getUserByToken(sessionToken, db);
    if(!thisUser) throw new Error("Invalid session token");
    const limit = 10;
    const messages = await db.collection<Message>("messages").find({
        $or: [
            { from: thisUser?._id, to: new ObjectId(recipientId) },
            { from: new ObjectId(recipientId), to: thisUser?._id }
        ],
    }).sort({ createdAt: -1 }).skip(page * limit).limit(limit).toArray();
    return messages;
}

async function sendMessage(sessionToken: string, recipientId: string, message: string, attachments: Attachment[], db: Db){
    const thisUser = await getUserByToken(sessionToken, db);
    if(!thisUser) throw new Error("Invalid session token");
    
    const newMessage: Message = {
        from: thisUser._id,
        to: new ObjectId(recipientId),
        content: message,
        sentAt: new Date(),
        attachments: [],
        isDeleted: false
    };
    if(attachments.length > 0){
        attachments = attachments.map(attachment => {
            attachment.allowedUsers = [newMessage.from, newMessage.to];
            return attachment;
        });
        let result = await db.collection<Attachment>("attachments").insertMany(attachments);
        console.log(result);
        for(const key in result.insertedIds){
            newMessage.attachments.push(result.insertedIds[key]);
        }
    }
    await db.collection<Message>("messages").insertOne(newMessage);
    return newMessage;
}

async function deleteMessage(sessionToken: string, messageId: string, db: Db){
    const thisUser = await getUserByToken(sessionToken, db);
    if(!thisUser) return false;
    await db.collection<Message>("messages").deleteOne({ 
        $and: [
            { _id: new ObjectId(messageId) },
            { from: thisUser._id }
        ]
    });
    return true;
}

async function editMessage(sessionToken: string, messageId: string, newMessage: string, db: Db){
    const thisUser = await getUserByToken(sessionToken, db);
    if(!thisUser) return false;
    const message = await db.collection<Message>("messages").findOne({ _id: new ObjectId(messageId) });
    if(!message) return false;
    if(message.from != thisUser._id) return false;
    await db.collection<Message>("messages").updateOne({ _id: new ObjectId(messageId) }, { $set: { content: newMessage } });
    return true;
}

export {
    getRecipients,
    getMessages,
    sendMessage,
    deleteMessage,
    editMessage
};