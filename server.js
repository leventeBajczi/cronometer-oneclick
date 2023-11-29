const http = require('http');
const https = require('https');
const fs = require('fs');
const url = require('url');
const cheerio = require('cheerio');
const querystring = require('querystring');

const baseurl = "cronometer.com";
const username = process.env.CR_USERNAME;
const password = process.env.CR_PASSWORD;

const caloriesId = {food: "15357971", serving: "41971562"};
const proteinId = {food: "15357929", serving: "41971437"};
const carbohydrateId = {food: "23473505", serving: "64357488"};
const fatId = {food: "15357967", serving: "41971552"};

function csrf() {
    return new Promise((resolve, reject) => {
        console.log("Getting csrf");
        https.get('https://' + baseurl + "/login/", (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                const $ = cheerio.load(data);
                const antiCsrfValue = $('input[name="anticsrf"]').val();
                console.log({antiCsrfValue: antiCsrfValue});
                resolve({value: antiCsrfValue, cookies: res.headers['set-cookie']});
            });
        }).on('error', (data) => {
            console.error(data);
            reject(data);
        })
    });
}

function sesnonce(csrf) {
    return new Promise((resolve, reject) => {
        console.log("Getting sesnonce");
        const postData = querystring.stringify({
            'username': username,
            'password': password,
            'anticsrf': csrf.value
        });
          
        const options = {
            hostname: baseurl,
            port: 443,
            path: '/login',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': csrf.cookies,
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                const cookies = res.headers['set-cookie'];
                if(cookies) {
                    for (let i = 0; i < cookies.length; i++) {
                        const cookie = cookies[i].split(';')[0].split('=');
                        if (cookie[0] === 'sesnonce') {
                            const value = cookie[1];
                            console.log({sesnonce: value});
                            resolve(value);
                            return;
                        }
                    }
                    reject("no-such-cookie: " + JSON.stringify({data: data, cookies: cookies}));
                }
                reject("no-cookies: " + JSON.stringify({data: data, headers: res.headers}));
            })
        });
        
        req.write(postData);
        req.end();
    });
}

function addData(nonce, id, amount, dateStr) {
    return new Promise((resolve, reject) => {
        const date = new Date(dateStr);

        const day = date.getDate();
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        // const data = `7|0|9|https://cronometer.com/cronometer/|3F3D68A6C8269C1940D0F9F4147958AE|com.cronometer.shared.rpc.CronometerService|addServing|java.lang.String/2004016611|com.cronometer.shared.entries.models.Serving/955192269|I|${nonce}|com.cronometer.shared.entries.models.Day/782579793|1|2|3|4|3|5|6|7|8|6|9|${day}|${month}|${year}|0|0|0|${(amount*100).toFixed(0)}|${id.food}|A|${id.serving}|3|0|4677888|`;
        // const data = `7|0|9|https://cronometer.com/cronometer/|82CCD30578522199DE0F5458B8D07285|com.cronometer.shared.rpc.CronometerService|addServing|java.lang.String/2004016611|com.cronometer.shared.entries.models.Serving/2553599101|I|${nonce}|com.cronometer.shared.entries.models.Day/782579793|1|2|3|4|3|5|6|7|8|6|9|${day}|${month}|${year}|1|1|0|4|0|0|${(amount*100).toFixed(0)}|${id.food}|A|${id.serving}|0|0|4677888|`
        const data = `7|0|12|https://cronometer.com/cronometer/|948B95EFABE5D3BF9B07D85F5A49865C|com.cronometer.shared.rpc.CronometerService|updateDiary|java.lang.String/2004016611|I|java.util.List|${nonce}|java.util.Collections$SingletonList/1586180994|com.cronometer.shared.entries.changes.AddEntryChange/3949104564|com.cronometer.shared.entries.models.Serving/2553599101|com.cronometer.shared.entries.models.Day/782579793|1|2|3|4|3|5|6|7|8|4677888|9|10|1|1|11|12|${day}|${month}|${year}|1|1|0|3|0|0|${(amount*100).toFixed(0)}|${id.food}|A|${id.serving}|0|0|`
           
        console.log(data);
        const options = {
        hostname: 'cronometer.com',
        port: 443,
        path: '/cronometer/app',
        method: 'POST',
        headers: {
            'Content-Type': 'text/x-gwt-rpc; charset=UTF-8',
            'X-GWT-Module-Base': 'https://cronometer.com/cronometer/',
            'X-GWT-Permutation': '7B121DC5483BF272B1BC1916DA9FA963',
            'Content-Length': data.length
        }
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            res.on('end', () => {
                resolve(responseData);
            });
        });
        req.on('error', (err) => {
            reject(err);
        })

        req.write(data);
        req.end();
    });
}

function handleData(amount, date) {
    return new Promise((resolve, reject) => {
        csrf().then(csrf => sesnonce(csrf).then(nonce => {
            addData(nonce, caloriesId, amount.calories, date).then(ret1 => {
                addData(nonce, proteinId, amount.protein, date).then(ret2 => {
                    addData(nonce, carbohydrateId, amount.carbohydrate, date).then(ret3 => {
                        addData(nonce, fatId, amount.fat, date).then(ret4 => resolve(JSON.stringify([ret1, ret2, ret3, ret4])));
                    })
                })
            });
        }).catch((err) => console.error({nonce_err: err}))).catch((err) => console.error({csrf_err: err}));
    });
}


const server = http.createServer((req, res) => {
    if (req.method === 'GET') {
        // Serve the form
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.readFile('./form.html', null, (error, data) => {
            if (error) {
                res.writeHead(404);
                res.write('File not found!');
            } else {
                res.write(data);
            }
            res.end();
        });
    } else if (req.method === 'POST') {
        // Handle form submission
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
        });
        req.on('end', () => {
            const data = querystring.parse(body);
            const amounts = {
                calories: data.calories * data.amount,
                protein: data.protein * data.amount,
                carbohydrate: data.carbohydrate * data.amount,
                fat: data.fat * data.amount,
            };
            handleData(amounts,data.date).then((data) => {
                res.write(data);
                res.end();
            });
        });
    }
});

server.listen(8000);
console.log('Server listening on port 8000');
