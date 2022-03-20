export class APIError {
    public title: string;
    public message: string;

    constructor(title: string, message: string) {
        this.title = title;
        this.message = message;
    }
}

export class UserError extends APIError {}

export enum InputType {
    Username,
    Password,
    Name,
    Email,
    Token,
    Groupname,
    String
}

export function validateInput(input: string, type: InputType) {
    // There is probably a more efficent way to do this but I would
    // like the error messages to be concise for the users

    // The last check in each case serves as the final security check using a regex
    switch(type) {
        case InputType.Username:
            if(input.length < 6) throw new UserError('Username Too Short', 'Username must be at least 6 characters long.');
            if(input.length > 30) throw new UserError('Username Too Long', 'Username cannot be longer than 30 characters.');
            if(!/^([a-z0-9]+[\.-]?){6,30}$/.test(input)) throw new UserError('Invalid Username', 'Username must contain alphanumeric characters and optionally include "." or "-".');
            break;
        case InputType.Password:
            if(input.length < 8) throw new UserError('Password Too Short', 'Password must be at least 8 characters long.');
            if(!/[0-9]/.test(input)) throw new UserError('Password Must Contain Number', 'Password must contain at least 1 number.');
            if(!/[A-Z]/.test(input)) throw new UserError('Password Must Contain Capital', 'Password must contain at least 1 capital letter.');
            if(!/[a-z]/.test(input)) throw new UserError('Password Must Contain Lowercase', 'Password must contain at least 1 lowercase letter.');
            if(!/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])[0-9a-zA-Z\.\-\\\/?!@#$%^&*()+=~]{8,}$/.test(input)) throw new UserError('Invalid Password', 'Password contains invalid characters.');
            break;
        case InputType.Name:
            if(input.length < 2) throw new UserError('Name Too Short', 'Name must be at least 2 letters long.');
            if(input.length > 30) throw new UserError('Name Too Long', 'Name cannot be longer than 30 letters long.');
            if(/[0-9]/.test(input)) throw new UserError('Invalid Name', 'Name cannot contain any numeric characters.');
            if(/[~?!@#$%^&*()_+=<>`'\\\/\[\]\{\}\|]/.test(input)) throw new UserError('Invalid Name Characters', 'Name can only contain alphabetic letters and hyphens.');
            if(!/^([A-Za-z]+){2,30}$/.test(input)) throw new UserError('Invalid Name', `The name '${input}' contains invalid characters.`);
            break;
        case InputType.Email:
            if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) throw new UserError('Invalid Email Address', `Email address '${input}' is invalid.`);
            break;
        case InputType.Token:
            if(!/^([0-9a-f]{8})\-([0-9a-f]{4})\-([0-9a-f]{4})\-([0-9a-f]{4})\-([0-9a-f]{12})$/.test(input)) throw new APIError('Invalid Token', `The provided token '${input}' is not acceptable.`);
            break;
        case InputType.Groupname:
            if(input.length < 2) throw new UserError('Input too Short', 'Input must be at least 2 characters long.');
            if(input.length > 30) throw new UserError('Input Too Long', 'Input cannot exceed 30 characters.');
            if(!/^([\w \-:!$&()]+){2,30}$/.test(input)) throw new UserError('Invalid Input', 'Input can only contain alphanumeric characters and select symbols.');
            break;
        case InputType.String:
            if(input.length > 1024) throw new UserError('Input Too Long', 'Input cannot exceed 1024 characters.');
            break;
        default:
            throw new APIError('Unknown Input Type', `No input validation rules defined for type '${InputType[type]}'`);
    }
}