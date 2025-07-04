function formatDate(isoString) {
    const date = new Date(isoString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // bulan dari 0-11
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

module.exports = { formatDate };