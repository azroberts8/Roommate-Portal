export class InputError {
    public title: string;
    public message: string;
    public value: string;

    constructor(title: string, message: string, value: string) {
        this.title = title;
        this.message = message;
        this.value = value;
    }

    public toString(): string {
        return `[${ this.constructor.name }: ${ this.title }] ${ this.message }`;
    }

    public debug(): string {
        return `[${ this.constructor.name }: ${ this.title }] "${ this.value }": ${ this.message }`;
    }

    public report() {
        return {
            type: this.constructor.name,
            title: this.title,
            message: this.message
        }
    }
}

export enum InputType {
    Username,
    Password,
    Name,
    Email,
    Token,
    String,
    Header
}

export function screenInput(input: string, type: InputType): string {
    switch(type) {
        case InputType.Username:
            if(input.length < 6) throw new InputError('Username Too Short', 'Username must be at least 6 characters long.', input);
            if(input.length > 30) throw new InputError('Username Too Long', 'Username cannot be longer than 30 characters.', input);
            if(!/^([A-Za-z0-9]+[\.-]?){6,30}$/.test(input)) throw new InputError('Invalid Username', 'Username must contain alphanumeric characters and optionally include "." or "-".', input);
            return input.toLowerCase();
        case InputType.Password:
            if(input.length < 8) throw new InputError('Password Too Short', 'Password must be at least 8 characters long.', input);
            if(!/[0-9]/.test(input)) throw new InputError('Password Must Contain Number', 'Password must contain at least 1 number.', input);
            if(!/[A-Z]/.test(input)) throw new InputError('Password Must Contain Capital', 'Password must contain at least 1 capital letter.', input);
            if(!/[a-z]/.test(input)) throw new InputError('Password Must Contain Lowercase', 'Password must contain at least 1 lowercase letter.', input);
            if(!/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])[0-9a-zA-Z\.\-\\\/?!@#$%^&*()+=~]{8,}$/.test(input)) throw new InputError('Invalid Password', 'Password contains invalid characters.', input);
            return input;
        case InputType.Name:
            if(input.length < 2) throw new InputError('Name Too Short', 'Name must be at least 2 letters long.', input);
            if(input.length > 30) throw new InputError('Name Too Long', 'Name cannot be longer than 30 letters long.', input);
            if(/[0-9]/.test(input)) throw new InputError('Invalid Name', 'Name cannot contain any numeric characters.', input);
            if(/[~?!@#$%^&*()_+=<>`'\\\/\[\]\{\}\|]/.test(input)) throw new InputError('Invalid Name Characters', 'Name can only contain alphabetic letters and hyphens.', input);
            if(!/^([A-Za-z]+){2,30}$/.test(input)) throw new InputError('Invalid Name', `The name '${input}' contains invalid characters.`, input);
            return input.charAt(0).toUpperCase() + input.slice(1);
        case InputType.Email:
            if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) throw new InputError('Invalid Email Address', `Email address '${input}' is invalid.`, input);
            return input;
        case InputType.Token:
            if(!/^([0-9a-f]{8})\-([0-9a-f]{4})\-([0-9a-f]{4})\-([0-9a-f]{4})\-([0-9a-f]{12})$/.test(input)) throw new InputError('Invalid Token', `The provided token '${input}' is not acceptable.`, input);
            return input;
        case InputType.String:
            if(input.length > 1024) throw new InputError('Input Too Long', 'Input cannot exceed 1024 characters.', `${ input.substring(0, 30) }...`);
            return input;
        case InputType.Header:
            if(input.length < 2) throw new InputError('Input Too Short', 'Input must be at least 2 characters long.', input);
            if(input.length > 30) throw new InputError('Input Too Long', 'Input cannot exceed 30 characters.', input);
            if(!/^([\w \-:!$&()]+){2,30}$/.test(input)) throw new InputError('Invalid Input', 'Input can only contain alphanumeric characters and select symbols.', input);
            return input;
        default:
            throw new InputError('Unknown Input Type', `No input validation rules defined for type '${ InputType[type] }'.`, `${ InputType[type] }`);
    }
}

export function errorHandler(e: any): { status: string, body: any } {
    if(e instanceof InputError) return { status: "Error", body: e.report() };
    else return { status: "Error", body: { type: "Server Error", message: e.toString() }};
}