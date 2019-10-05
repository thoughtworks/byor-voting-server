// test is the email has the following format _@_._  which is the basic email structure
export function isEmailValid(email: string) {
    return /\S+@\S+\.\S+/.test(email);
}
