function generateSecurePassword() {
    const special = "!@#$%^&*()_+=-";
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";

    // Ensuring at least one of each character type
    let password = "";
    password += special.charAt(Math.floor(Math.random() * special.length));
    password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
    password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
    password += numbers.charAt(Math.floor(Math.random() * numbers.length));

    // Adding more random characters to reach minimum length (8)
    const allChars = special + lowercase + uppercase + numbers;
    for (let i = 0; i < 8; i++) {
        password += allChars.charAt(Math.floor(Math.random() * allChars.length));
    }

    // Shuffling the password to avoid predictable patterns
    return password
        .split("")
        .sort(() => 0.5 - Math.random())
        .join("");
}

module.exports = { generateSecurePassword };
