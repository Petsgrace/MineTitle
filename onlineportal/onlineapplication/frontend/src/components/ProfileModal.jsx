import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Save, User, Mail, Phone, MapPin, Briefcase } from 'lucide-react';

const ProfileModal = ({ isOpen, onClose, user, onUpdateUser }) => {
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        email: '',
        telephone: '',
        contact_address: '',
        date_of_birth: '',
        role: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    useEffect(() => {
        if (isOpen) {
            fetchProfile();
        }
    }, [isOpen]);

    const fetchProfile = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get('/api/user/profile/');
            setFormData(response.data);
        } catch (err) {
            setError('Failed to load profile data.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await axios.put('/api/user/profile/', formData);
            setSuccess('Profile updated successfully!');

            // Construct new display name
            const firstName = response.data.first_name || '';
            const lastName = response.data.last_name || '';
            let newName = `${firstName} ${lastName}`.trim();
            if (!newName) newName = response.data.username;

            // Notify parent to update user state
            if (onUpdateUser) {
                onUpdateUser({
                    ...user,
                    name: newName,
                    username: response.data.username
                });
            }

            setTimeout(() => {
                setSuccess(null);
                onClose();
            }, 1500);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update profile.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleDateChange = (e) => {
        const value = e.target.value;
        setFormData({ ...formData, date_of_birth: value });

        // Immediate Validation
        if (value) {
            const birthDate = new Date(value);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            if (age < 21) {
                setError("You must be at least 21 years of age.");
            } else {
                setError(null);
            }
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up">
                {/* Header */}
                <div className="bg-emerald-700 text-white px-6 py-4 flex justify-between items-center">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <User size={20} />
                        My Profile
                    </h2>
                    <button onClick={onClose} className="hover:bg-emerald-600 p-1 rounded-full transition">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6">
                    {loading && <div className="text-center py-4 text-emerald-600">Loading...</div>}

                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="bg-green-50 text-green-600 p-3 rounded-lg mb-4 text-sm font-medium">
                            {success}
                        </div>
                    )}

                    {!loading && (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                                    <input
                                        type="text"
                                        name="first_name"
                                        value={formData.first_name}
                                        onChange={handleChange}
                                        className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-emerald-500 focus:border-emerald-500 p-2 border"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Surname</label>
                                    <input
                                        type="text"
                                        name="last_name"
                                        value={formData.last_name}
                                        onChange={handleChange}
                                        className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-emerald-500 focus:border-emerald-500 p-2 border"
                                        required
                                    />
                                </div>
                                {/* Full width for DOB */}
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                                    <input
                                        type="date"
                                        name="date_of_birth"
                                        value={formData.date_of_birth || ''}
                                        onChange={handleDateChange}
                                        className={`w-full rounded-lg shadow-sm focus:ring-emerald-500 focus:border-emerald-500 p-2 border ${error && error.includes('21') ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                                        required
                                    />
                                    {error && error.includes('21') && <p className="text-xs text-red-600 mt-1">{error}</p>}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                                    <Mail size={14} /> Email Address
                                </label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-emerald-500 focus:border-emerald-500 p-2 border"
                                    required
                                />
                            </div>

                            {/* Only show Farmer fields if applicable */}
                            {(formData.telephone !== undefined || formData.contact_address !== undefined) && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                                            <Phone size={14} /> Telephone
                                        </label>
                                        <input
                                            type="tel"
                                            name="telephone"
                                            value={formData.telephone || ''}
                                            onChange={handleChange}
                                            placeholder="+263..."
                                            className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-emerald-500 focus:border-emerald-500 p-2 border"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                                            <MapPin size={14} /> Address
                                        </label>
                                        <textarea
                                            name="contact_address"
                                            value={formData.contact_address || ''}
                                            onChange={handleChange}
                                            rows="2"
                                            className="w-full border-gray-300 rounded-lg shadow-sm focus:ring-emerald-500 focus:border-emerald-500 p-2 border"
                                        ></textarea>
                                    </div>
                                </>
                            )}

                            {formData.role && (
                                <div className="pt-2 border-t border-gray-100">
                                    <div className="flex items-center gap-2 text-sm text-gray-500">
                                        <Briefcase size={14} />
                                        <span>Role: <span className="font-medium text-gray-700 capitalize">{formData.role}</span></span>
                                    </div>
                                </div>
                            )}

                            <div className="pt-4 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition flex items-center gap-2 shadow-md"
                                >
                                    <Save size={18} />
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProfileModal;
