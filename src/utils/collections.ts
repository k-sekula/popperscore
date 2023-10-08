import { ObjectId } from "mongodb";

interface User {
    username: string;
    fullName?: string;
    email: string;
    passwordHash: string;
    createdAt: Date;
    updatedAt: Date;
    avatar?: string;
    isConfirmed: boolean;
}

interface Message {
    from: ObjectId;
    to: ObjectId;
    content: string;
    attachments: ObjectId[];
    sentAt: Date;
    readAt?: Date;
    isDeleted: boolean;
}

interface Session {
    token: string;
    userId: ObjectId;
    expiresAt: Date;
}

interface Attachment {
    filename: string;
    data: ArrayBuffer;
    createdAt: Date;
    allowedUsers?: [ObjectId, ObjectId];
}

const ValidatorSchemas = {
    user: {
        $jsonSchema: {
            bsonType: "object",
            required: ["username", "email", "passwordHash", "createdAt", "updatedAt", "isConfirmed"],
            properties: {
                username: {
                    bsonType: "string",
                    description: "must be a string and is required"
                },
                fullName: {
                    bsonType: "string",
                    description: "must be a string"
                },
                email: {
                    bsonType: "string",
                    description: "must be a string and is required"
                },
                passwordHash: {
                    bsonType: "string",
                    description: "must be a string and is required"
                },
                createdAt: {
                    bsonType: "date",
                    description: "must be a date and is required"
                },
                updatedAt: {
                    bsonType: "date",
                    description: "must be a date and is required"
                },
                avatar: {
                    bsonType: "string",
                    description: "must be a string"
                },
                isConfirmed: {
                    bsonType: "bool",
                    description: "must be a boolean and is required"
                }
            }
        }
    },
    message: {
        $jsonSchema: {
            bsonType: "object",
            required: ["from", "to", "content", "sentAt", "isDeleted"],
            properties: {
                from: {
                    bsonType: "objectId",
                    description: "must be an objectId and is required"
                },
                to: {
                    bsonType: "objectId",
                    description: "must be an objectId and is required"
                },
                content: {
                    bsonType: "string",
                    description: "must be a string and is required"
                },
                attachments: {
                    bsonType: "array",
                    description: "must be an array of strings"
                },
                sentAt: {
                    bsonType: "date",
                    description: "must be a date and is required"
                },
                readAt: {
                    bsonType: "date",
                    description: "must be a date"
                },
                isDeleted: {
                    bsonType: "bool",
                    description: "must be a boolean and is required"
                }
            }
        }
    },
    session: {
        $jsonSchema: {
            bsonType: "object",
            required: ["token", "userId", "expiresAt"],
            properties: {
                token: {
                    bsonType: "string",
                    description: "must be a string and is required"
                },
                userId: {
                    bsonType: "objectId",
                    description: "must be an objectId and is required"
                },
                expiresAt: {
                    bsonType: "date",
                    description: "must be a date and is required"
                }
            }
        }
    }
};

type ValidatorSchema =
    typeof ValidatorSchemas["user"] |
    typeof ValidatorSchemas["message"] |
    typeof ValidatorSchemas["session"];

function getValidatorSchema($for: "message" | "user" | "session"): ValidatorSchema {
    return ValidatorSchemas[$for];
}

export {
    User,
    Message,
    Attachment,
    Session,
    getValidatorSchema
}