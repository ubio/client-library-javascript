var defaultApiUrl = 'https://api.automationcloud.net';
var defaultVaultUrl = 'https://vault.automationcloud.net';
var defaultFetch = typeof self !== 'undefined' && self.fetch && self.fetch.bind(self);
var useSse = false;
var base64Encode;

if (typeof btoa === 'function') {
    base64Encode = function(string) {
        return btoa(string);
    };
} else if (typeof Buffer === 'function') {
    base64Encode = function(string) {
        return Buffer.from(string).toString('base64');
    };
} else {
    throw new Error('No way to convert to base64.');
}

function assertStringArguments(obj) {
    Object.keys(obj || {}).forEach(function(key) {
        if (typeof obj[key] !== 'string') {
            throw new TypeError('"' + key + '" must be a string.');
        }
    });
}

function createSearch(parameters) {
    if (!parameters) {
        return '';
    }

    var query = [];

    Object.keys(parameters).forEach(function(key) {
        if (parameters[key] !== void 0) {
            query.push(encodeURIComponent(key) + '=' + encodeURIComponent(parameters[key]));
        }
    });

    var search = query.join('&');

    return search.length ? '?' + search : '';
}


function fetchWrapper(url, fetch, token, opts) {
    var options = opts || {};
    var method = options.method || 'GET';
    var query = options.query;

    if (!token) {
        throw new Error('No token.');
    }

    var headers = {};

    Object.keys(options.headers || {}).forEach(function(key) {
        headers[key] = options.headers[key];
    });

    headers['Authorization'] = 'Basic ' + base64Encode(token + ':');

    var body = options.body === void 0 ? void 0 : JSON.stringify(options.body);
    var search = createSearch(query);

    if (typeof body === 'string') {
        headers['Content-Type'] = 'application/json';
    }

    var fetchOptions = {
        method: method,
        headers: headers,
        body: body,
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'follow',
        referrer: 'https://ub.io/',
        referrerPolicy: 'origin',
        keepalive: false
    };

    // Edge 12 - Edge 18 only supports an early draft of the specification.
    // fetch() fails with 'Invalid argument' error when referrerPolicy: 'origin' option provided.
    if (typeof window !== 'undefined') {
        var ua = window && window.navigator && window.navigator.userAgent || '';
        var edge = ua.indexOf('Edge/');
        if (edge > 0) {
            var edgeVer = parseInt(ua.substring(edge + 5, ua.indexOf('.', edge)), 10);
            if (edgeVer <= 18) {
                fetchOptions.referrerPolicy = '';
            }
        }
    }

    return fetch(url + search, fetchOptions)
        .then(function(response) {
            if (!response.ok) {
                return response.json()
                    .then(function(body) {
                        // TODO: Better errors from error bodies.
                        const error = new Error(body.message || 'Unexpected response');
                        error.status = response.status;
                        throw error;
                    });
            }

            if (options.parse !== false) {
                return response.json();
            }

            return response;
        });
}

function makeApiClient(baseUrl, fetch, token) {
    var canonicalizedBaseUrl = baseUrl.slice(-1) === '/' ? baseUrl : (baseUrl + '/');

    function apiFetch(path, options) {
        return fetchWrapper(canonicalizedBaseUrl + path, fetch, token, options);
    }

    var api = {
        raw: function(path, options) {
            assertStringArguments({ path: path });
            return apiFetch(path, options);
        },
        getServices: function() {
            return apiFetch('services');
        },
        getService: function(serviceId) {
            assertStringArguments({ serviceId: serviceId });
            return apiFetch('services/' + serviceId);
        },
        getPreviousJobOutputs: function(serviceId, inputs, key) {
            assertStringArguments({ serviceId: serviceId });
            const body = { inputs: inputs || [] };
            const search = typeof key === 'string' ? '?key=' + encodeURIComponent(key) : '';

            return apiFetch('services/' + serviceId + '/previous-job-outputs' + search, { method: 'POST', body: body });
        },
        getJobs: function(query) {
            return apiFetch('jobs', { query: query });
        },
        createJob: function(fields) {
            return apiFetch('jobs', { method: 'POST', body: fields });
        },
        getJob: function(jobId) {
            assertStringArguments({ jobId: jobId });
            return apiFetch('jobs/' + jobId);
        },
        cancelJob: function(jobId) {
            assertStringArguments({ jobId: jobId });
            return apiFetch('jobs/' + jobId + '/cancel', { method: 'POST' });
        },
        resetJob: function(jobId, fromInputKey, preserveInputs) {
            assertStringArguments({ jobId: jobId });
            const body = { fromInputKey: fromInputKey, preserveInputs: preserveInputs || [] };

            return apiFetch('jobs/' + jobId + '/reset', { method: 'POST', body: body });
        },
        createJobInput: function(jobId, key, data) {
            assertStringArguments({ jobId: jobId, key: key });
            return apiFetch('jobs/' + jobId + '/inputs', { method: 'POST', body: { key: key, data: data } });
        },
        getJobOutputs: function(jobId) {
            assertStringArguments({ jobId: jobId });
            return apiFetch('jobs/' + jobId + '/outputs');
        },
        getJobOutput: function(jobId, key) {
            assertStringArguments({ jobId: jobId, key: key });

            var path = 'jobs/' + jobId + '/outputs/' + key;

            return apiFetch(path);
        },
        getJobScreenshots: function(jobId) {
            assertStringArguments({ jobId: jobId });
            return apiFetch('jobs/' + jobId + '/screenshots');
        },
        getJobScreenshot: function(jobIdOrPath, id, ext) {
            function toBlob(res) {
                return res.blob();
            }

            if (jobIdOrPath && jobIdOrPath[0] === '/') {
                return apiFetch(jobIdOrPath, { parse: false })
                    .then(toBlob);
            }

            assertStringArguments({ jobId: jobIdOrPath, id: id, ext: ext });

            return apiFetch('jobs/' + jobIdOrPath + '/screenshots/' + id + '.png', { parse: false })
                .then(toBlob);
        },
        getJobMimoLogs: function(jobId) {
            assertStringArguments({ jobId: jobId });
            return apiFetch('jobs/' + jobId + '/mimo-logs');
        },
        getJobEndUser: function(jobId) {
            assertStringArguments({ jobId: jobId });
            return apiFetch('jobs/' + jobId + '/end-user');
        },
        getJobEvents: function(jobId, offset) {
            assertStringArguments({ jobId: jobId });

            if (offset >>> 0 !== offset) {
                throw new RangeError('offset must be a positive integer.');
            }

            return apiFetch('jobs/' + jobId + '/events', { query: { offset: offset || 0 } });
        },
        getJobFiles: function(jobId) {
            assertStringArguments({ jobId: jobId });
            return apiFetch('jobs/' + jobId + '/files');
        },
        getJobFile: function(jobId, fileId) {
            assertStringArguments({ jobId: jobId, fileId: fileId });

            var isUrl = fileId.indexOf('http') === 0;

            if (isUrl && fileId.indexOf(canonicalizedBaseUrl) !== 0) {
                return fetch(fileId)
                    .then(function(res) {
                        if (!res.ok) {
                            throw new Error(`Unexpected status for request to ${fileId}: ${res.status}`);
                        }

                        return res.blob();
                    });
            }

            var url = isUrl ? fileId.slice(canonicalizedBaseUrl.length) : 'jobs/' + jobId + '/files/' + fileId;

            return apiFetch(url, { parse: false })
                .then(function(res) {
                    return res.blob();
                });
        },
        getActiveTds: function(jobId) {
            assertStringArguments({ jobId: jobId });
            return apiFetch('jobs/' + jobId + '/active-3d-secure');
        },
        trackJob: function(jobId, callback) {
            assertStringArguments({ jobId: jobId });

            if (useSse && typeof EventSource !== 'undefined') {
                return track(jobId, callback);
            }

            return poll(jobId, callback, 200);
        }
    };

    function delay(t) {
        return new Promise(function(resolve) {
            setTimeout(resolve, t);
        });
    }

    function track(jobId, callback) {
        var split = baseUrl.split('//');
        var protocol = split[0];
        var rest = split.slice(1).join('//');
        var sse = new EventSource(protocol + '//' + token + ':' + rest + '/jobs/' + jobId + '/events');
        var closed = false;

        function close() {
            if (!closed) {
                closed = true;
                sse.close();
                callback('close');
            }
        }

        sse.onmessage = function(event) {
            if (closed) {
                return;
            }

            var jobEvent;

            try {
                jobEvent = JSON.parse(event.data);
            } catch (e) {
                callback('error', new Error('Error parsing event data.'));
                return;
            }

            if (jobEvent.object !== 'job-event') {
                return;
            }

            callback(jobEvent.name, jobEvent);

            if (jobEvent.name === 'success' || jobEvent.name === 'fail') {
                close();
            }
        };

        sse.onerror = function(error) {
            callback('error', error);
        };

        return close;
    }

    function poll(jobId, callback, dt) {
        var offset = 0;
        var backoff = 0;
        var stopped = false;

        function stop() {
            if (!stopped) {
                stopped = true;
                callback('close');
            }
        }

        function run() {
            return delay(dt)
                .then(function() {
                    if (stopped) {
                        return;
                    }

                    return api.getJobEvents(jobId, offset)
                        .then(function(body) {
                            backoff = 0;
                            return body;
                        })
                        .catch(function(error) {
                            const message = error.stack || error.message;

                            // 4xy errors don't lead to a retry, since the
                            // client must change something before the
                            // request can work.
                            if (error.status < 500) {
                                callback('error', error);
                                stop();
                                return;
                            }

                            // 5xy errors lead to retries with backoff.
                            callback('error', error);

                            backoff += 1;

                            const backoffTime = ((dt + backoff * dt) / 1000).toFixed(1);

                            console.warn('Error contacting API. Retrying in ' + backoffTime + ' s. ', message);

                            return delay(backoff * dt)
                                .then(function() {
                                    return { data: [] };
                                });
                        });
                })
                .then(function(body) {
                    if (stopped) {
                        return;
                    }

                    var events = body.data.slice();

                    offset += events.length;

                    events.sort(function(a, b) {
                        return a.createdAt - b.createdAt;
                    });

                    events.forEach(function(event) {
                        callback(event.name, event);

                        if (event.name === 'success' || event.name === 'fail') {
                            stop();
                        }
                    });
                })
                .then(function() {
                    if (!stopped) {
                        return run();
                    }
                });
        }

        run();

        return stop;
    }

    return api;
}

function makeVaultClient(baseUrl, fetch, token) {
    var canonicalizedBaseiUrl = baseUrl.slice(-1) === '/' ? baseUrl : (baseUrl + '/');

    function vaultFetch(path, options) {
        return fetchWrapper(canonicalizedBaseiUrl + path, fetch, token, options);
    }

    var api = {
        createOtp: function() {
            return vaultFetch('otp', { method: 'POST' })
                .then(function unwrapOtp(otp) {
                    return otp.id;
                });
        },
        vaultPan: function(pan) {
            return api.createOtp()
                .then(function envaultPan(otp) {
                    return vaultFetch('pan', {
                        method: 'POST',
                        body: {
                            otp: otp,
                            pan: pan
                        }
                    });
                })
                .then(function getPanToken(pan) {
                    return vaultFetch('pan/temporary', {
                        method: 'POST',
                        body: {
                            panId: pan.id,
                            key: pan.key
                        }
                    });
                })
                .then(function unwrapPanToken(temp) {
                    return temp.panToken;
                });
        }
    };

    return api;
}

/**
 * @param {Object} options
 * @param {string} options.token
 * @param {string} options.apiUrl
 * @param {string} options.vaultUrl
 * @param {function} options.fetch
 */
export function createClientSdk(options) {
    if (!options || !options.token) {
        throw new Error('Token required.');
    }

    var apiUrl = options.apiUrl || defaultApiUrl;
    var vaultUrl = options.vaultUrl || defaultVaultUrl;
    var fetch = options.fetch || defaultFetch;
    var token = options.token;

    var apiClient = makeApiClient(apiUrl, fetch, token);
    var vaultClient = makeVaultClient(vaultUrl, fetch, token);

    apiClient.createOtp = function createOtp() {
        return vaultClient.createOtp();
    };

    return apiClient;
}

/**
 * @param {Object} options
 * @param {string} options.token
 * @param {string} options.jobId
 * @param {string} options.serviceId
 * @param {string} options.apiUrl
 * @param {string} options.vaultUrl
 * @param {function} options.fetch
 */
export function createEndUserSdk(options) {
    if (!options || !options.token) {
        throw new Error('A token required.');
    }

    if (!options.jobId) {
        throw new Error('A jobId is required.');
    }

    if (!options.serviceId) {
        throw new Error('A serviceId is required.');
    }

    var jobId = options.jobId;
    var serviceId = options.serviceId;
    var apiUrl = options.apiUrl || defaultApiUrl;
    var vaultUrl = options.vaultUrl || defaultVaultUrl;
    var fetch = options.fetch || defaultFetch;
    var token = options.token;

    var apiClient = makeApiClient(apiUrl, fetch, token);
    var vaultClient = makeVaultClient(vaultUrl, fetch, token);

    return {
        getService: function() {
            return apiClient.getService(serviceId);
        },
        getPreviousJobOutputs: function(inputs, key) {
            return apiClient.getPreviousJobOutputs(serviceId, inputs, key);
        },
        getJob: function() {
            return apiClient.getJob(jobId);
        },
        cancelJob: function() {
            return apiClient.cancelJob(jobId);
        },
        resetJob: function(fromInputKey, preserveInputs) {
            return apiClient.resetJob(jobId, fromInputKey, preserveInputs);
        },
        createJobInput: function(key, data) {
            return apiClient.createJobInput(jobId, key, data);
        },
        getJobOutputs: function() {
            return apiClient.getJobOutputs(jobId);
        },
        getJobOutput: function(key) {
            return apiClient.getJobOutput(jobId, key);
        },
        getJobScreenshots: function() {
            return apiClient.getJobScreenshots(jobId);
        },
        getJobScreenshot: function(idOrPath) {
            if (idOrPath && idOrPath[0] === '/') {
                return apiClient.getJobScreenshot(idOrPath);
            }

            return apiClient.getJobScreenshot(jobId, idOrPath);
        },
        getJobMimoLogs: function() {
            return apiClient.getJobMimoLogs(jobId);
        },
        getJobEvents: function(offset) {
            return apiClient.getJobEvents(jobId, offset);
        },
        getJobFiles: function() {
            return apiClient.getJobFiles(jobId);
        },
        getJobFile: function(fileId) {
            return apiClient.getJobFile(jobId, fileId);
        },
        getActiveTds: function() {
            return apiClient.getActiveTds(jobId);
        },
        trackJob: function(callback) {
            return apiClient.trackJob(jobId, callback);
        },
        createOtp: function() {
            return vaultClient.createOtp();
        },
        vaultPan: function(pan) {
            return vaultClient.vaultPan(pan);
        }
    };
}
