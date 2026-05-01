/** Returns null if id is valid, or an error message string. */
export function validateDomainId(id) {
    if (!id)
        return "ID домена пуст";
    if (!/^[\p{L}\p{N}_-]+$/u.test(id))
        return "ID допускает только буквы/цифры/_/-";
    return null;
}
