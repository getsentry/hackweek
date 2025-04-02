import React from 'react';
import PropTypes from 'prop-types';

const Button = ({
  children,
  type = 'button',
  priority = 'default',
  size = 'md',
  icon,
  iconPosition = 'left',
  disabled = false,
  onClick,
  className,
  ...props
}) => {
  const getButtonClasses = () => {
    const classes = ['custom-button'];
    classes.push(`custom-button-${priority}`);
    classes.push(`custom-button-${size}`);
    if (disabled) classes.push('custom-button-disabled');
    if (className) classes.push(className);
    return classes.join(' ');
  };

  return (
    <button
      type={type}
      className={getButtonClasses()}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {icon && iconPosition === 'left' && (
        <span className="button-icon button-icon-left">{icon}</span>
      )}
      <span className="button-content">{children}</span>
      {icon && iconPosition === 'right' && (
        <span className="button-icon button-icon-right">{icon}</span>
      )}
      <style jsx>{`
        .custom-button {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          border: 1px solid;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.1s ease;
          font-family: inherit;
        }

        .custom-button:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }

        /* Size Variants */
        .custom-button-md {
          padding: 10px 16px;
          font-size: 16px;
          box-shadow: 0 1px 2px rgba(43, 34, 51, 0.04), 0 3px 0 0 #584ac0;
        }

        .custom-button-sm {
          padding: 8px 12px;
          font-size: 14px;
          box-shadow: 0 1px 2px rgba(43, 34, 51, 0.04), 0 2px 0 0 #584ac0;
        }

        .custom-button-xs {
          padding: 6px 8px;
          font-size: 12px;
          box-shadow: 0 1px 2px rgba(43, 34, 51, 0.04), 0 1px 0 0 #584ac0;
        }

        /* Priority Variants */
        .custom-button-default {
          color: #2b2233;
          background: #ffffff;
          border-color: #e0dce5;
          box-shadow: 0 1px 2px rgba(43, 34, 51, 0.04), 0 3px 0 0 #e0dce5;
        }

        .custom-button-default:hover {
          transform: translateY(-1px);
        }

        .custom-button-default:active {
          transform: translateY(2px);
          box-shadow: 0 1px 2px rgba(43, 34, 51, 0.04) inset, 0 0 0 0 #d1ccd8;
        }

        .custom-button-primary {
          color: #ffffff;
          background: #6c5fc7;
          border-color: #6c5fc7;
          box-shadow: 0 1px 2px rgba(43, 34, 51, 0.04), 0 3px 0 0 #584ac0;
        }

        .custom-button-primary:hover {
          transform: translateY(-1px);
        }

        .custom-button-primary:active {
          transform: translateY(2px);
          box-shadow: 0 1px 2px rgba(43, 34, 51, 0.04) inset, 0 0 0 0 #4a3da1;
        }

        .custom-button-secondary {
          color: #ffffff;
          background: #3c74dd;
          border-color: #3c74dd;
          box-shadow: 0 1px 2px rgba(43, 34, 51, 0.04), 0 3px 0 0 #2562d4;
        }

        .custom-button-secondary:hover {
          transform: translateY(-1px);
        }

        .custom-button-secondary:active {
          transform: translateY(2px);
          box-shadow: 0 1px 2px rgba(43, 34, 51, 0.04) inset;
        }

        .custom-button-secondary:focus {
          outline: none;
          border-color: #3c74dd;
          box-shadow: #3c74dd 0 0 0 1px, rgba(60, 116, 221, 0.5) 0 0 0 4px,
            0 3px 0 0 #2562d4;
        }

        .custom-button-secondary:focus:active {
          box-shadow: 0 1px 2px rgba(43, 34, 51, 0.04) inset;
        }

        .custom-button-danger {
          color: #ffffff;
          background: #f55459;
          border-color: #f55459;
          box-shadow: 0 1px 2px rgba(43, 34, 51, 0.04), 0 3px 0 0 #df3338;
        }

        .custom-button-danger:hover {
          transform: translateY(-1px);
        }

        .custom-button-danger:active {
          transform: translateY(2px);
          box-shadow: 0 1px 2px rgba(43, 34, 51, 0.04) inset, 0 0 0 0 #c42d31;
        }

        .button-icon {
          display: flex;
          align-items: center;
        }

        .button-icon-left {
          margin-right: 8px;
        }

        .button-icon-right {
          margin-left: 8px;
        }

        .button-content {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
      `}</style>
    </button>
  );
};

Button.propTypes = {
  children: PropTypes.node.isRequired,
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
  priority: PropTypes.oneOf(['default', 'primary', 'secondary', 'danger']),
  size: PropTypes.oneOf(['xs', 'sm', 'md']),
  icon: PropTypes.node,
  iconPosition: PropTypes.oneOf(['left', 'right']),
  disabled: PropTypes.bool,
  onClick: PropTypes.func,
  className: PropTypes.string,
};

export default Button;
