import { Db, ObjectId } from 'mongodb';
import { User, Session } from './utils/collections.js';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

async function sessionExists(token: string, db: Db) {
    return !!await db.collection('sessions').findOne({ token });
}

async function login(username: string, password: string, db: Db) {
    let match = await db.collection<User>('users').findOne({ username });
    if (match) {
        if (!match.isConfirmed) {
            return { error: "not_confirmed" };
        }
        if (bcrypt.compareSync(password, match.passwordHash)) {
            let token = crypto.randomBytes(32).toString('hex');
            while (await db.collection<Session>('sessions').findOne({ token: token })) {
                token = crypto.randomBytes(32).toString('hex');
            }
            let week = 1000 * 60 * 60 * 24 * 7;
            await db.collection<Session>('sessions').insertOne({
                token,
                userId: match._id,
                expiresAt: new Date(Date.now() + week)
            });
            return { token };
        }
    }
}

type ValidationResult = {
    valid: boolean;
    errors?: string[];
};

function validateUserData(registerData: {
    username: string;
    fullName?: string;
    password: string;
    email: string;
}): ValidationResult {
    let errors: string[] = [];
    if (!registerData.username) {
        errors.push('username_required');
    } else {
        // at least 3 and up to 20 characters, only letters, numbers, and underscores
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(registerData.username)) {
            errors.push('username_invalid');
        }
    }
    if (!registerData.password) {
        errors.push('password_required');
    } else {
        // at least 8 and up to 256 characters, at least one uppercase letter, one lowercase letter, one special char, and one number
        if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])(?=.{8,256})/.test(registerData.password)) {
            errors.push('password_invalid');
        }
    }
    if (!registerData.email) {
        errors.push('email_required');
    } else {
        // email regex from https://emailregex.com/
        if (
            !/(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/
                .test(registerData.email)
        ) {
            errors.push('email_invalid');
        }
    }
    if(registerData.fullName) {
        if(registerData.fullName.length > 256) {
            errors.push('full_name_too_long');
        }
        // only letters, spaces, and apostrophes (letters may be diacritics)
        if(!/^[a-zA-Z\u00C0-\u017F' ]+$/.test(registerData.fullName)) {
            errors.push('full_name_invalid');
        }
    }
    if (errors.length > 0) {
        return { valid: false, errors };
    }
    return { valid: true };
}

async function createUser({ username, fullName, password, email, db }: {
    username: string;
    fullName?: string;
    password: string;
    email: string;
} & { db: Db }) {
    console.log('creating user');
    let user: User = {
        username,
        fullName,
        passwordHash: bcrypt.hashSync(password, 10),
        email,
        createdAt: new Date(),
        updatedAt: new Date(),
        isConfirmed: false
    };
    console.log('inserting user');
    await db.collection<User>('users').insertOne(user);
    return user;
}

async function getUser(username: string, db: Db) {
    return await db.collection<User>('users').findOne({ username });
}

async function getUserById(id: string, db: Db) {
    return await db.collection<User>('users').findOne({ _id: new ObjectId(id) });
}

async function getUserByToken(token: string, db: Db) {
    let session = await db.collection<Session>('sessions').findOne({ token });
    if (session) {
        return await getUserById(session.userId.toHexString(), db);
    }
}

async function confirmUser(username: string, db: Db) {
    return await db.collection<User>('users').updateOne({ username }, { $set: { isConfirmed: true } });
}

async function deleteUser(sessionToken: string, db: Db) {
    let session = await db.collection<Session>('sessions').findOne({ token: sessionToken });
    if (!session) {
        return;
    }
    let userId = session.userId;
    return await db.collection<User>('users').deleteOne({ _id: userId });
}

async function updateUser(username: string, update: Partial<User>, db: Db) {
    return await db.collection<User>('users').updateOne({ username }, { $set: update });
}

export {
    login,
    validateUserData,
    createUser,
    getUser,
    getUserById,
    getUserByToken,
    confirmUser,
    deleteUser,
    updateUser,
    sessionExists
};
