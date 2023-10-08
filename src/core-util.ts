import Express, {
    NextFunction,
    Request,
    Response,
} from "express";
import multer from "multer";
import { Db, MongoClient } from "mongodb";
import * as Init from "./utils/init.js";

const mongo = (await MongoClient.connect(
    process.env.MONGO_URI || "mongodb://127.0.0.1:27017"
));
const db = mongo.db("poppers");
await Init.init(db);

const multerInstance = multer({ dest: "uploads/" });
const app = Express();
app.use(Express.json());
app.use(Express.urlencoded({ extended: true }));

const applyDb = (req: Request & { db?: Db }, res: Response, next: NextFunction) => { 
    req.db = db;
    next();
};

app.use(applyDb);

function Get(path: string, ...middlewares: any[]) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        app.get(path, ...middlewares,
            (req: Request, res: Response, next: NextFunction) => {
                console.log(`Executing GET ${path}`)
                descriptor.value(req, res, next);
            }
        );
        console.log(`Registered GET ${path}`);
    }
}

function Post(path: string, ...middlewares: any[]) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        app.post(path, ...middlewares,
            (req: Request, res: Response, next: NextFunction) => {
                console.log(`Executing POST ${path}`, req.body)
                descriptor.value(req, res, next);
            }
        );
        console.log(`Registered POST ${path}`);
    }
}

function Put(path: string, ...middlewares: any[]) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        app.put(path, ...middlewares,
            (req: Request, res: Response, next: NextFunction) => {
                descriptor.value(req, res, next);
            }
        );
    }
}

function Delete(path: string, ...middlewares: any[]) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        app.delete(path, ...middlewares,
            (req: Request, res: Response, next: NextFunction) => {
                descriptor.value(req, res, next);
            }
        );
    }
}

function Patch(path: string, ...middlewares: any[]) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        app.patch(path, ...middlewares,
            (req: Request, res: Response, next: NextFunction) => {
                descriptor.value(req, res, next);
            }
        );
    }
}

function listen(port: number) {
    app.listen(port, () => {
        console.log(`Listening on port ${port}.`);
    });
}

export {
    Get,
    Post,
    Put,
    Delete,
    Patch,
    multerInstance,
    listen,
};
