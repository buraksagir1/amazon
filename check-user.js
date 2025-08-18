import axios from 'axios';

const userId = '6845f537375d9943a00ebc51';

async function checkUser() {
    try {
        const response = await axios.get(`http://localhost:5001/api/users/status/${userId}`);
        console.log('User status:', response.data);
    } catch (error) {
        if (error.response) {
            console.log('Error response:', error.response.data);
        } else {
            console.log('Error:', error.message);
        }
    }
}

checkUser(); 