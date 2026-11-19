import request from "./request";

export const getUsers=(params={})=>{
    return request.get('/users',{params})
}

export const getUsersSummary=()=>{
    return request.get('/users/summary')
}

export const createUser=(data)=>{
    return request.post('/users',data)
}

export const updateUser=(id,data)=>{
    return request.put(`/users/${id}`,data)
}


export const toggleUserStatus=(id,status)=>{
    return request.put(`/users/${id}/status`,{status})
}

export const deleteUser=(id)=>{
    return request.delete(`/users/${id}`)
}

export const batchUserStatus=(ids,data)=>{
    return request.put('/users/batch/status',{ids,data})
}

export const getRoles=()=>{
    return request.get('/roles')
}